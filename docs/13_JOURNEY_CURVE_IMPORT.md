# Journey Curve Import

## Purpose

Journey supports freehand drawing, but drawing one long smooth route with a
mouse is difficult.

The curve import workflow lets the owner create a route image with an AI image
tool, import that image in Journey edit mode, and convert the visible route into
ordinary Journey stroke points.

The source image is not saved.

Only the generated route points become part of the Journey canvas draft.

The imported route is not written to PostgreSQL until the owner clicks
`保存画布`.

## Current Canvas Size

Journey canvas coordinates use a fixed width of `1000`.

The canvas height is configurable in the Journey editor.

When generating an AI image, use the current Journey canvas width and height as
the target aspect ratio. If the canvas is `1000 x 2400`, generate a `1000 x
2400` image or another image with the same aspect ratio, such as `1024 x 2458`.

If the source image and Journey canvas aspect ratios differ, the importer can
still map the route, but full mapping may stretch the curve.

## Supported Import Types

The editor supports:

* PNG.
* WebP.
* JPG / JPEG.
* Journey curve JSON.

SVG import is not part of this version.

Files are processed locally in the browser.

The browser does not upload the source image to the backend.

The browser does not call an external image recognition API.

## Raster Image Contract

Raster tracing v1 is designed for one AI-generated dashed or dotted route.

Recommended image properties:

* Transparent PNG background.
* One route only.
* Dashed or dotted line.
* High contrast single-color route.
* No text.
* No stickers.
* No scenery.
* No multiple unrelated curves.
* No self-intersection.
* Optional circular start marker near the first point.

Opaque plain-color backgrounds are also supported. The importer estimates the
background color from the image corners and extracts pixels that differ enough
from that background.

Raster v1 does not reliably trace one large continuous solid brushstroke. If
the image looks like one connected solid component, the importer will reject it
and ask for a dashed/dotted route image or JSON.

## AI Prompt Template

Use this prompt as a starting point:

```text
请生成一张尺寸为 [画布宽度] x [画布高度] 的透明背景 PNG。
图片中只包含一条从顶部开始、向下延伸的平滑虚线曲线。
不要添加文字、贴纸、阴影、风景或额外线条。
路线不得自相交。
线条使用高对比度单色。
虚线片段和间隔保持稳定。
四周保留适当边距。
可在起点添加一个圆环，但不要添加其他圆形装饰。
```

For the current default Journey canvas, `[画布宽度]` is `1000`. The height should
match the current editor canvas height.

## JSON Import

JSON is the most deterministic format because it already contains centerline
points.

Canonical schema:

```json
{
  "version": "journey-curve-import-v1",
  "source": {
    "width": 1024,
    "height": 1536
  },
  "coordinateSpace": "source-pixels",
  "points": [
    { "x": 100.0, "y": 100.0 },
    { "x": 120.0, "y": 101.0 }
  ]
}
```

Minimal schema:

```json
{
  "sourceWidth": 1024,
  "sourceHeight": 1536,
  "points": [
    { "x": 100.0, "y": 100.0 },
    { "x": 120.0, "y": 101.0 }
  ]
}
```

Normalized coordinate schema:

```json
{
  "coordinateSpace": "normalized",
  "points": [
    { "x": 0.1, "y": 0.05 },
    { "x": 0.2, "y": 0.1 }
  ]
}
```

Normalized coordinates should be in the `0..1` range.

JSON import accepts only route point data. It does not accept stickers, nodes,
media URLs, image Data URLs, or full canvas state.

## Mapping Modes

The importer provides two mapping modes.

### 完整映射到画布

The source rectangle maps to the complete Journey canvas.

This is the default mode.

Use it when the AI image was generated with the same aspect ratio as the Journey
canvas.

### 保持比例并居中

The source route keeps its aspect ratio, fits inside the Journey canvas, and is
centered.

Use it when the source image aspect ratio differs from the current Journey
canvas.

## Import Workflow

1. Open `journey.html?edit=1`.
2. Enter Journey edit mode with an account that has `homepage:edit`.
3. Click `导入曲线`.
4. Select PNG, WebP, JPG, or JSON.
5. Inspect the source preview.
6. Inspect the extracted centerline overlay.
7. Confirm the green start marker and red end marker.
8. Reverse direction if needed.
9. Choose the mapping mode.
10. Click `新增到画布` or `替换现有曲线`.
11. Inspect the route on the real Journey canvas.
12. Use `撤销导入` if the result is wrong.
13. Click `保存画布` only after the imported route is accepted.

Closing or cancelling the dialog does not change the Journey canvas.

Previewing a file does not save anything.

## Add, Replace, and Undo

`新增到画布` appends one ordinary Journey stroke.

`替换现有曲线` replaces existing strokes with one imported stroke, but preserves
nodes and stickers. Nodes are reattached to the imported route.

Before either action, the editor keeps one transient in-memory undo snapshot.

`撤销导入` restores the previous strokes and node attachments.

The undo snapshot is not saved to the database and is not exported.

## Persistence Rules

The importer never persists:

* Source image bytes.
* Object URLs.
* Data URLs.
* Component masks.
* Parsed component lists.
* Import settings.
* Source filename.
* Source dimensions.

The imported result becomes a normal Journey stroke:

* `id`
* `points`
* `width`
* `createdAt`
* `updatedAt`

The existing Journey save flow remains authoritative.

## Known Limits

Raster auto-tracing v1 is intentionally conservative.

It may reject:

* Solid continuous lines.
* Multiple unrelated routes.
* Noisy images.
* Low-contrast images.
* Images with scenery, text, or stickers.

When raster recognition is not reliable, use JSON import.
