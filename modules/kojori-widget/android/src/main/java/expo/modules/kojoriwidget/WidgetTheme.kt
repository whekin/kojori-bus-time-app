package expo.modules.kojoriwidget

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import androidx.core.content.ContextCompat
import org.json.JSONObject

// Base widget colors come from day/night resources so the widget always
// matches the device theme, regardless of the theme selected inside the app.
// Only the route accents come from the synced app palette, picked for the
// device color scheme at render time.
object WidgetTheme {
  data class Accents(val route380: Int, val route316: Int)

  fun accents(context: Context, root: JSONObject?): Accents {
    val isNight = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
      Configuration.UI_MODE_NIGHT_YES
    val schemeKey = if (isNight) "dark" else "light"
    val palette = root?.optJSONObject("palette")?.optJSONObject(schemeKey)
    return Accents(
      route380 = parseColor(context, palette?.optString("route380"), R.color.widget_amber),
      route316 = parseColor(context, palette?.optString("route316"), R.color.widget_teal),
    )
  }

  private fun parseColor(context: Context, hex: String?, fallbackRes: Int): Int {
    return runCatching {
      if (hex.isNullOrBlank()) ContextCompat.getColor(context, fallbackRes) else Color.parseColor(hex)
    }.getOrElse { ContextCompat.getColor(context, fallbackRes) }
  }
}
