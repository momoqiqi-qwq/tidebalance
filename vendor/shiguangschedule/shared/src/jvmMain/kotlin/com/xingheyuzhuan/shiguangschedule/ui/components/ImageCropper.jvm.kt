package com.xingheyuzhuan.shiguangschedule.ui.components

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asSkiaBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jetbrains.skia.EncodedImageFormat
import org.jetbrains.skia.Image
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.IRect

/**
 * Le: enable the upstream common crop preview on desktop too.
 */
actual val isCropWindowEnabled: Boolean = true

/**
 * Apply the same crop rectangle selected in the upstream common UI.
 */
actual suspend fun cropImageBitmapNative(
    source: ImageBitmap,
    srcLeft: Int,
    srcTop: Int,
    cropWidth: Int,
    cropHeight: Int
): ByteArray = withContext(Dispatchers.IO) {
    val skiaBitmap = source.asSkiaBitmap()

    require(srcLeft >= 0 && srcTop >= 0 && cropWidth > 0 && cropHeight > 0)
    require(srcLeft.toLong() + cropWidth <= source.width && srcTop.toLong() + cropHeight <= source.height)
    Bitmap().use { cropped ->
        check(skiaBitmap.extractSubset(cropped, IRect.makeXYWH(srcLeft, srcTop, cropWidth, cropHeight)))
        Image.makeFromBitmap(cropped).use { image ->
            image.encodeToData(EncodedImageFormat.JPEG, 90)?.use { it.bytes }
                ?: throw IllegalStateException("Desktop image encoding failed")
        }
    }
}
