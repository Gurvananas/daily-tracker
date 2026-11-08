package io.github.gurvananas.dailytracker

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Reads daily steps and last night's sleep from Health Connect (where the COROS
 * app, like most watch apps, writes its data). Read-only: nothing is ever written.
 */
@CapacitorPlugin(name = "HealthSync")
class HealthSyncPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val stepsPermission = HealthPermission.getReadPermission(StepsRecord::class)
    private val sleepPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val permissions = setOf(stepsPermission, sleepPermission)

    private val awakeStages = setOf(
        SleepSessionRecord.STAGE_TYPE_AWAKE,
        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
    )

    private fun client() = HealthConnectClient.getOrCreate(context)

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun sdkStatus(): String = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
        else -> "unavailable"
    }

    private suspend fun grantedResult(): JSObject {
        val granted = client().permissionController.getGrantedPermissions()
        val ret = JSObject()
        ret.put("sdk", "available")
        ret.put("steps", granted.contains(stepsPermission))
        ret.put("sleep", granted.contains(sleepPermission))
        ret.put("granted", granted.containsAll(permissions))
        return ret
    }

    /** { sdk: "available" | "update_required" | "unavailable", granted, steps, sleep } */
    @PluginMethod
    fun status(call: PluginCall) {
        val sdk = sdkStatus()
        if (sdk != "available") {
            val ret = JSObject()
            ret.put("sdk", sdk)
            ret.put("granted", false)
            ret.put("steps", false)
            ret.put("sleep", false)
            call.resolve(ret)
            return
        }
        scope.launch {
            try {
                call.resolve(grantedResult())
            } catch (e: Exception) {
                call.reject(e.message ?: "Erreur Health Connect", e)
            }
        }
    }

    /** Shows the Health Connect permission screen, then resolves like status(). */
    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (sdkStatus() != "available") {
            call.reject("Health Connect n'est pas disponible sur ce téléphone")
            return
        }
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, permissions)
        startActivityForResult(call, intent, "onAccessResult")
    }

    @ActivityCallback
    private fun onAccessResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch {
            try {
                call.resolve(grantedResult())
            } catch (e: Exception) {
                call.reject(e.message ?: "Erreur Health Connect", e)
            }
        }
    }

    /** Opens Health Connect (to manage sources and permissions), or its Play Store page to install it. */
    @PluginMethod
    fun openHealthConnect(call: PluginCall) {
        val intent = if (sdkStatus() == "available") {
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding"))
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            call.resolve()
        } catch (e: ActivityNotFoundException) {
            call.reject("Impossible d'ouvrir Health Connect", e)
        }
    }

    /**
     * readDays({ dates: ["2026-11-08", …] }) →
     * { days: [{ date, steps?, sleepMinutes?, bedtime?, wakeup?, sleepSource? }], steps, sleep }
     * Sleep is attached to the day you wake up; bedtime / wakeup are minutes since midnight.
     */
    @PluginMethod
    fun readDays(call: PluginCall) {
        val dates = try {
            call.getArray("dates")?.toList<String>()
        } catch (e: Exception) {
            null
        }
        if (dates.isNullOrEmpty()) {
            call.reject("Aucune date demandée")
            return
        }
        scope.launch {
            try {
                val hc = client()
                val granted = hc.permissionController.getGrantedPermissions()
                val canSteps = granted.contains(stepsPermission)
                val canSleep = granted.contains(sleepPermission)
                val zone = ZoneId.systemDefault()
                val days = JSArray()
                for (d in dates) {
                    val day = LocalDate.parse(d)
                    val o = JSObject()
                    o.put("date", d)
                    if (canSteps) {
                        val agg = hc.aggregate(
                            AggregateRequest(
                                metrics = setOf(StepsRecord.COUNT_TOTAL),
                                timeRangeFilter = TimeRangeFilter.between(day.atStartOfDay(), day.plusDays(1).atStartOfDay()),
                            ),
                        )
                        agg[StepsRecord.COUNT_TOTAL]?.let { o.put("steps", it) }
                    }
                    if (canSleep) {
                        readSleep(hc, day, zone)?.let { s ->
                            o.put("sleepMinutes", s.minutes)
                            o.put("bedtime", s.bedtime)
                            o.put("wakeup", s.wakeup)
                            o.put("sleepSource", s.source)
                        }
                    }
                    days.put(o)
                }
                val ret = JSObject()
                ret.put("days", days)
                ret.put("steps", canSteps)
                ret.put("sleep", canSleep)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Erreur Health Connect", e)
            }
        }
    }

    private data class Sleep(val minutes: Long, val bedtime: Int, val wakeup: Int, val source: String)

    /** The night that ends on `day`: sessions ending between 18:00 the day before and 18:00 that day. */
    private suspend fun readSleep(hc: HealthConnectClient, day: LocalDate, zone: ZoneId): Sleep? {
        val windowStart = day.minusDays(1).atTime(18, 0).atZone(zone).toInstant()
        val windowEnd = day.atTime(18, 0).atZone(zone).toInstant()
        val response = hc.readRecords(
            ReadRecordsRequest(
                recordType = SleepSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(windowStart.minus(Duration.ofHours(18)), windowEnd),
            ),
        )
        val sessions = response.records.filter { it.endTime.isAfter(windowStart) && !it.endTime.isAfter(windowEnd) }
        if (sessions.isEmpty()) return null
        // Several apps may record the same night (watch + phone): keep the source with the most sleep.
        val best = sessions.groupBy { it.metadata.dataOrigin.packageName }
            .maxByOrNull { entry -> entry.value.sumOf { asleepSeconds(it) } } ?: return null
        val chosen = best.value
        val main = chosen.maxByOrNull { Duration.between(it.startTime, it.endTime) } ?: return null
        return Sleep(
            minutes = chosen.sumOf { asleepSeconds(it) } / 60,
            bedtime = clockMinutes(main.startTime, main.startZoneOffset, zone),
            wakeup = clockMinutes(main.endTime, main.endZoneOffset, zone),
            source = best.key,
        )
    }

    /** Time actually asleep: stages minus awake periods, or the whole session if it has no stages. */
    private fun asleepSeconds(s: SleepSessionRecord): Long {
        if (s.stages.isEmpty()) return Duration.between(s.startTime, s.endTime).seconds
        return s.stages.filter { it.stage !in awakeStages }.sumOf { Duration.between(it.startTime, it.endTime).seconds }
    }

    private fun clockMinutes(t: Instant, offset: ZoneOffset?, zone: ZoneId): Int {
        val local = if (offset != null) t.atOffset(offset).toLocalTime() else t.atZone(zone).toLocalTime()
        return local.hour * 60 + local.minute
    }
}
