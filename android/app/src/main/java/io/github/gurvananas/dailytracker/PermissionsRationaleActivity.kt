package io.github.gurvananas.dailytracker

import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Shown by Health Connect when the user asks why the app wants access to health data. */
class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setPadding(pad, pad, pad, pad)
            textSize = 16f
            text = getString(R.string.health_rationale)
        }
        setContentView(ScrollView(this).apply {
            fitsSystemWindows = true
            addView(text)
        })
    }
}
