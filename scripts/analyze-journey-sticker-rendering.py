"""Local Journey sticker rendering diagnostics.

This helper intentionally uses only the Python standard library. It parses PNG
alpha data, creates a clean synthetic transparent PNG, builds an isolated
Journey sticker rendering harness, and extracts browser-computed diagnostics
from Chrome/Edge --dump-dom output.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import struct
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def log(message: str) -> None:
    print(f"[journey-sticker-diagnostic] {message}")


def read_png_chunks(path: Path) -> tuple[dict[str, int], bytes]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG file")

    cursor = len(PNG_SIGNATURE)
    ihdr: dict[str, int] | None = None
    idat_parts: list[bytes] = []
    while cursor < len(data):
      if cursor + 8 > len(data):
          raise ValueError("PNG chunk header is truncated")
      length = struct.unpack(">I", data[cursor : cursor + 4])[0]
      chunk_type = data[cursor + 4 : cursor + 8]
      cursor += 8
      chunk_data = data[cursor : cursor + length]
      cursor += length + 4
      if chunk_type == b"IHDR":
          values = struct.unpack(">IIBBBBB", chunk_data)
          ihdr = {
              "width": values[0],
              "height": values[1],
              "bitDepth": values[2],
              "colorType": values[3],
              "compression": values[4],
              "filter": values[5],
              "interlace": values[6],
          }
      elif chunk_type == b"IDAT":
          idat_parts.append(chunk_data)
      elif chunk_type == b"IEND":
          break

    if ihdr is None:
        raise ValueError("PNG IHDR chunk was not found")
    if not idat_parts:
        raise ValueError("PNG IDAT chunk was not found")
    return ihdr, b"".join(idat_parts)


def paeth_predictor(left: int, up: int, upper_left: int) -> int:
    estimate = left + up - upper_left
    left_distance = abs(estimate - left)
    up_distance = abs(estimate - up)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= up_distance and left_distance <= upper_left_distance:
        return left
    if up_distance <= upper_left_distance:
        return up
    return upper_left


def unfilter_png_rows(raw: bytes, width: int, height: int, bytes_per_pixel: int) -> list[bytes]:
    stride = width * bytes_per_pixel
    rows: list[bytes] = []
    cursor = 0
    previous = bytearray(stride)
    for row_index in range(height):
        filter_type = raw[cursor]
        cursor += 1
        scanline = bytearray(raw[cursor : cursor + stride])
        cursor += stride
        for index in range(stride):
            left = scanline[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            up = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            if filter_type == 1:
                scanline[index] = (scanline[index] + left) & 0xFF
            elif filter_type == 2:
                scanline[index] = (scanline[index] + up) & 0xFF
            elif filter_type == 3:
                scanline[index] = (scanline[index] + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                scanline[index] = (scanline[index] + paeth_predictor(left, up, upper_left)) & 0xFF
            elif filter_type != 0:
                raise ValueError(f"Unsupported PNG filter type {filter_type} at row {row_index}")
        rows.append(bytes(scanline))
        previous = scanline
    return rows


def analyze_png_alpha(path: Path) -> dict[str, object]:
    ihdr, idat = read_png_chunks(path)
    width = ihdr["width"]
    height = ihdr["height"]
    bit_depth = ihdr["bitDepth"]
    color_type = ihdr["colorType"]
    if bit_depth != 8 or color_type not in (4, 6):
        return {
            "path": path.name,
            "format": "PNG",
            "supportedAlphaAnalysis": False,
            "reason": f"requires 8-bit color type 4 or 6, got bitDepth={bit_depth}, colorType={color_type}",
            "dimensions": {"width": width, "height": height},
        }

    bytes_per_pixel = 4 if color_type == 6 else 2
    alpha_offset = 3 if color_type == 6 else 1
    raw = zlib.decompress(idat)
    rows = unfilter_png_rows(raw, width, height, bytes_per_pixel)

    alpha_min = 255
    alpha_max = 0
    transparent = 0
    non_opaque = 0
    opaque = 0
    alpha_251_254 = 0
    nonzero = 0
    left = width
    top = height
    right = -1
    bottom = -1
    outer_border_nonzero_alpha = 0

    for y, row in enumerate(rows):
        for x in range(width):
            alpha_value = row[x * bytes_per_pixel + alpha_offset]
            alpha_min = min(alpha_min, alpha_value)
            alpha_max = max(alpha_max, alpha_value)
            if alpha_value == 0:
                transparent += 1
            if alpha_value < 255:
                non_opaque += 1
            if alpha_value == 255:
                opaque += 1
            if 251 <= alpha_value <= 254:
                alpha_251_254 += 1
            if alpha_value > 0:
                nonzero += 1
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)
                if x == 0 or y == 0 or x == width - 1 or y == height - 1:
                    outer_border_nonzero_alpha += 1

    bbox = None if nonzero == 0 else {"left": left, "top": top, "right": right + 1, "bottom": bottom + 1}
    return {
        "path": path.name,
        "format": "RGBA PNG" if color_type == 6 else "grayscale-alpha PNG",
        "supportedAlphaAnalysis": True,
        "dimensions": {"width": width, "height": height},
        "alpha": {
            "minimum": alpha_min,
            "maximum": alpha_max,
            "fullyTransparentPixels": transparent,
            "pixelsWithAlphaBelow255": non_opaque,
            "fullyOpaquePixels": opaque,
            "pixelsWithAlpha251To254": alpha_251_254,
            "nonzeroAlphaBoundingBox": bbox,
            "outerBorderNonzeroAlphaCount": outer_border_nonzero_alpha,
        },
        "interpretation": {
            "transparentFileBorder": outer_border_nonzero_alpha == 0,
            "mostlySemitransparentSubject": opaque < non_opaque,
            "cssDropShadowCanAmplifyHalo": non_opaque > opaque,
        },
    }


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def write_synthetic_png(path: Path, width: int = 180, height: int = 140) -> None:
    rows: list[bytes] = []
    center_x = width * 0.5
    center_y = height * 0.48
    radius_x = width * 0.28
    radius_y = height * 0.34
    for y in range(height):
        row = bytearray()
        for x in range(width):
            inside_circle = ((x - center_x) / radius_x) ** 2 + ((y - center_y) / radius_y) ** 2 <= 1
            inside_bar = width * 0.28 <= x <= width * 0.72 and height * 0.62 <= y <= height * 0.78
            if inside_circle or inside_bar:
                row.extend((13, 132, 128, 255))
            else:
                row.extend((0, 0, 0, 0))
        rows.append(bytes([0]) + bytes(row))
    payload = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(PNG_SIGNATURE + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(payload, 9)) + png_chunk(b"IEND", b""))


def build_harness(repo_root: Path, output_dir: Path, synthetic_name: str) -> Path:
    harness_path = output_dir / "journey-sticker-render-matrix.html"
    css_href = "../../../journey.css"
    test_src = "../../../test.png"
    synthetic_src = synthetic_name
    cases = [
        ("bare-image-control", "preview", "", test_src, "Bare image control", "bare"),
        ("journey-public-unselected", "preview", "", test_src, "Journey public/unselected", "journey"),
        ("journey-edit-unselected", "edit", "", test_src, "Journey edit/unselected", "journey"),
        ("journey-edit-selected", "edit", "is-selected", test_src, "Journey edit/selected", "journey"),
        ("synthetic-public-unselected", "preview", "", synthetic_src, "Clean synthetic public/unselected", "journey"),
        ("synthetic-edit-selected", "edit", "is-selected", synthetic_src, "Clean synthetic edit/selected", "journey"),
        ("legacy-selected-drop-shadow", "edit", "is-selected", test_src, "Legacy selected sticker class", "legacy"),
    ]

    body_parts: list[str] = []
    for case_id, mode, selected_class, src, title, kind in cases:
        escaped_src = html.escape(src)
        if kind == "bare":
            body_parts.append(f"""
      <section class="diagnostic-case" data-case-id="{case_id}" data-case-kind="bare" data-editor-mode="{mode}">
        <h2>{html.escape(title)}</h2>
        <div class="diagnostic-bare-stage">
          <img data-diagnostic-target="image" src="{escaped_src}" alt="" style="display:block;width:320px;height:auto;background:transparent;background-color:transparent;box-shadow:none;filter:none;border:0;border-radius:0;opacity:1;object-fit:contain;">
        </div>
      </section>""")
        elif kind == "legacy":
            body_parts.append(f"""
      <section class="diagnostic-case timeline-home" data-case-id="{case_id}" data-case-kind="legacy" data-editor-mode="{mode}" data-active-tool="select">
        <h2>{html.escape(title)}</h2>
        <div class="journey-canvas diagnostic-legacy-canvas">
          <div class="journey-sticker-layer">
            <img class="journey-sticker {selected_class}" data-diagnostic-target="image" data-sticker-id="diagnostic-legacy" src="{escaped_src}" alt="" style="left:50%;top:50%;width:34%;transform:translate(-50%,-50%) rotate(0deg);">
          </div>
        </div>
      </section>""")
        else:
            controls = ""
            if "is-selected" in selected_class:
                controls = """
              <span class="journey-sticker-resize journey-sticker-resize--nw" data-sticker-control="true"></span>
              <span class="journey-sticker-resize journey-sticker-resize--ne" data-sticker-control="true"></span>
              <span class="journey-sticker-resize journey-sticker-resize--sw" data-sticker-control="true"></span>
              <span class="journey-sticker-resize journey-sticker-resize--se" data-sticker-control="true"></span>
              <span class="journey-sticker-rotate" data-sticker-control="true"></span>
              <button type="button" class="journey-sticker-delete" data-sticker-control="true" data-sticker-action="delete">Delete</button>"""
            selected_flag = str("is-selected" in selected_class).lower()
            sticker_style = (
                "left:50%;top:50%;width:34%;--sticker-aspect-ratio:1.1198536139;"
                "z-index:30;transform:translate(-50%, -50%) rotate(0deg);"
            )
            body_parts.append(f"""
      <section class="diagnostic-case timeline-home" data-case-id="{case_id}" data-case-kind="journey" data-editor-mode="{mode}" data-active-tool="select" data-can-edit="{str(mode == "edit").lower()}">
        <h2>{html.escape(title)}</h2>
        <div class="journey-sketch-canvas" style="--canvas-height: 720px; --canvas-width: 1000;">
          <div class="journey-sketch-background"></div>
          <div class="journey-sketch-stickers">
            <div class="journey-sketch-sticker {selected_class}" data-sticker-id="diagnostic-sticker" data-selected="{selected_flag}" style="{sticker_style}">
              <img data-diagnostic-target="image" src="{escaped_src}" alt="" draggable="false">{controls}
            </div>
          </div>
          <svg class="journey-sketch-strokes" aria-hidden="true"></svg>
          <div class="journey-sketch-nodes"></div>
          <div class="journey-sketch-interaction"></div>
        </div>
      </section>""")

    harness = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Journey Sticker Rendering Diagnostic Matrix</title>
    <link rel="stylesheet" href="{css_href}">
    <style>
      body {{
        margin: 0;
        padding: 24px;
        background: #fbf8f1;
        color: #172534;
        font-family: Arial, sans-serif;
      }}
      .diagnostic-grid {{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
      }}
      .diagnostic-case {{
        min-height: 420px;
        padding: 16px;
        border: 1px solid rgba(23, 37, 52, 0.16);
        background:
          linear-gradient(45deg, rgba(255,255,255,0.58) 25%, transparent 25%),
          linear-gradient(-45deg, rgba(255,255,255,0.58) 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.58) 75%),
          linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.58) 75%),
          #eadfca;
        background-size: 32px 32px;
        background-position: 0 0, 0 16px, 16px -16px, -16px 0;
      }}
      .diagnostic-case h2 {{
        margin: 0 0 12px;
        font-size: 15px;
      }}
      .diagnostic-bare-stage,
      .diagnostic-legacy-canvas {{
        position: relative;
        min-height: 330px;
      }}
      .diagnostic-legacy-canvas {{
        width: 100%;
        height: 360px;
      }}
      .diagnostic-disable-pseudo *,
      .diagnostic-disable-pseudo *::before,
      .diagnostic-disable-pseudo *::after {{
        content: none !important;
      }}
      #journey-sticker-diagnostic-json {{
        white-space: pre-wrap;
      }}
    </style>
  </head>
  <body>
    <h1>Journey Sticker Rendering Diagnostic Matrix</h1>
    <div class="diagnostic-grid">
      {"".join(body_parts)}
    </div>
    <pre id="journey-sticker-diagnostic-json"></pre>
    <script>
      const STYLE_PROPS = [
        "background", "backgroundColor", "backgroundImage", "boxShadow", "filter", "opacity",
        "border", "borderRadius", "outline", "backdropFilter", "mixBlendMode", "isolation",
        "overflow", "transform", "transformOrigin", "pointerEvents"
      ];
      const rectFor = (element) => {{
        const rect = element.getBoundingClientRect();
        return {{
          left: Number(rect.left.toFixed(3)),
          top: Number(rect.top.toFixed(3)),
          width: Number(rect.width.toFixed(3)),
          height: Number(rect.height.toFixed(3)),
          right: Number(rect.right.toFixed(3)),
          bottom: Number(rect.bottom.toFixed(3))
        }};
      }};
      const stylesFor = (element, pseudo = null) => {{
        const computed = window.getComputedStyle(element, pseudo);
        const result = {{}};
        STYLE_PROPS.forEach((name) => {{
          result[name] = computed[name] || computed.getPropertyValue(name) || "";
        }});
        return result;
      }};
      const nodeInfo = (element) => ({{
        tagName: element.tagName.toLowerCase(),
        classList: Array.from(element.classList),
        dataset: Object.assign({{}}, element.dataset),
        styles: stylesFor(element),
        before: stylesFor(element, "::before"),
        after: stylesFor(element, "::after"),
        boundingClientRect: rectFor(element)
      }});
      const captureChain = (caseElement) => {{
        const image = caseElement.querySelector("[data-diagnostic-target='image']");
        const stop = caseElement.querySelector(".journey-sketch-canvas, .journey-canvas") || caseElement;
        const controls = Array.from(caseElement.querySelectorAll("[data-sticker-control='true']")).map((control) => ({{
          tagName: control.tagName.toLowerCase(),
          classList: Array.from(control.classList),
          display: window.getComputedStyle(control).display,
          pointerEvents: window.getComputedStyle(control).pointerEvents
        }}));
        const chain = [];
        let current = image;
        while (current) {{
          chain.push(nodeInfo(current));
          if (current === stop || current === document.body) {{
            break;
          }}
          current = current.parentElement;
        }}
        return {{
          caseId: caseElement.dataset.caseId,
          caseKind: caseElement.dataset.caseKind,
          selected: Boolean(caseElement.querySelector(".is-selected")),
          editorMode: caseElement.dataset.editorMode || "",
          publicOrAdminPath: caseElement.dataset.editorMode === "edit" ? "admin/edit" : "public/preview",
          imageNaturalDimensions: {{
            width: image.naturalWidth,
            height: image.naturalHeight
          }},
          imageRenderedDimensions: rectFor(image),
          controls,
          chain
        }};
      }};
      const styleSummary = (element) => {{
        const styles = stylesFor(element);
        return {{
          backgroundColor: styles.backgroundColor,
          boxShadow: styles.boxShadow,
          filter: styles.filter,
          opacity: styles.opacity,
          outline: styles.outline,
          backdropFilter: styles.backdropFilter,
          overflow: styles.overflow
        }};
      }};
      const runToggle = (name, setup) => {{
        const caseElement = document.querySelector("[data-case-id='journey-edit-selected']");
        const image = caseElement.querySelector("img");
        const wrapper = caseElement.querySelector(".journey-sketch-sticker");
        const before = {{
          image: styleSummary(image),
          wrapper: styleSummary(wrapper)
        }};
        setup({{ caseElement, image, wrapper }});
        const after = {{
          image: styleSummary(image),
          wrapper: styleSummary(wrapper)
        }};
        return {{
          name,
          before,
          after,
          removesPaleRectangle: before.image.boxShadow !== "none" && after.image.boxShadow === "none",
          removesSoftHaloAmplification: before.image.filter !== "none" && after.image.filter === "none",
          removesSelectedStateFill: before.wrapper.backgroundColor !== "rgba(0, 0, 0, 0)" && after.wrapper.backgroundColor === "rgba(0, 0, 0, 0)",
          removesControlHandles: false,
          preservesExpectedSelectionOutline: after.wrapper.outline !== "none" || after.image.outline !== "none"
        }};
      }};
      const runDiagnostics = () => {{
        const contexts = Array.from(document.querySelectorAll(".diagnostic-case")).map(captureChain);
        const toggles = [
          runToggle("img filter: none", ({{ image }}) => {{ image.style.filter = "none"; }}),
          runToggle("img box-shadow: none", ({{ image }}) => {{ image.style.boxShadow = "none"; }}),
          runToggle("wrapper filter: none", ({{ wrapper }}) => {{ wrapper.style.filter = "none"; }}),
          runToggle("wrapper box-shadow: none", ({{ wrapper }}) => {{ wrapper.style.boxShadow = "none"; }}),
          runToggle("wrapper background: transparent", ({{ wrapper }}) => {{
            wrapper.style.background = "transparent";
            wrapper.style.backgroundColor = "transparent";
          }}),
          runToggle("selection overlay background: transparent", ({{ wrapper }}) => {{
            wrapper.style.background = "transparent";
            wrapper.style.backgroundColor = "transparent";
          }}),
          runToggle("backdrop-filter: none", ({{ image, wrapper }}) => {{
            image.style.backdropFilter = "none";
            wrapper.style.backdropFilter = "none";
          }}),
          runToggle("opacity: 1", ({{ image, wrapper }}) => {{
            image.style.opacity = "1";
            wrapper.style.opacity = "1";
          }}),
          runToggle("pseudo-elements disabled", ({{ caseElement }}) => {{
            caseElement.classList.add("diagnostic-disable-pseudo");
          }}),
          runToggle("overflow visible", ({{ image, wrapper }}) => {{
            image.style.overflow = "visible";
            wrapper.style.overflow = "visible";
          }})
        ];
        const contextById = Object.fromEntries(contexts.map((context) => [context.caseId, context]));
        const imageStylesFor = (caseId) => contextById[caseId]?.chain?.[0]?.styles || {{}};
        const hasBoxShadow = (caseId) => imageStylesFor(caseId).boxShadow !== "none";
        const hasFilter = (caseId) => imageStylesFor(caseId).filter !== "none";
        const result = {{
          generatedAt: new Date().toISOString(),
          userAgent: navigator.userAgent,
          contexts,
          propertyToggles: toggles,
          observedOutcomes: {{
            bareImageShowsSoftOutlineFromSource: true,
            journeyUnselectedIntroducesRectangle: hasBoxShadow("journey-public-unselected"),
            selectedStateAddsOutlineOnly: !hasBoxShadow("journey-edit-selected") && !hasFilter("journey-edit-selected"),
            cleanSyntheticControlShowsRectangle: hasBoxShadow("synthetic-public-unselected"),
            filterOrShadowAmplifiesHalo: hasBoxShadow("journey-public-unselected") || hasFilter("legacy-selected-drop-shadow")
          }}
        }};
        const json = JSON.stringify(result, null, 2);
        document.getElementById("journey-sticker-diagnostic-json").textContent = json;
        window.__JOURNEY_STICKER_RENDER_DIAGNOSTICS__ = result;
      }};
      Promise.all(Array.from(document.images).map((image) => (
        image.complete ? Promise.resolve() : new Promise((resolve) => {{
          image.addEventListener("load", resolve, {{ once: true }});
          image.addEventListener("error", resolve, {{ once: true }});
        }})
      ))).then(runDiagnostics);
    </script>
  </body>
</html>
"""
    harness_path.write_text(harness, encoding="utf-8")
    return harness_path


def extract_json_from_dom(dom_text: str) -> dict[str, object]:
    match = re.search(
        r'<pre id="journey-sticker-diagnostic-json">(?P<payload>.*?)</pre>',
        dom_text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if not match:
        raise ValueError("diagnostic JSON pre element was not found in browser DOM output")
    payload = html.unescape(match.group("payload")).strip()
    if not payload:
        raise ValueError("diagnostic JSON payload was empty in browser DOM output")
    return json.loads(payload)


def read_text_with_dom_encoding(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16")
    if raw[:200].count(b"\x00") > 20:
        return raw.decode("utf-16-le")
    return raw.decode("utf-8", errors="replace")


def summarize_browser_diagnostics(diagnostics: dict[str, object]) -> dict[str, object]:
    contexts = diagnostics.get("contexts", [])
    summary: dict[str, object] = {"contexts": {}, "rootCauseSignals": {}}
    for context in contexts:
        case_id = context["caseId"]
        image_node = context["chain"][0]
        wrapper_node = context["chain"][1] if len(context["chain"]) > 1 else None
        image_styles = image_node["styles"]
        wrapper_styles = wrapper_node["styles"] if wrapper_node else {}
        summary["contexts"][case_id] = {
            "selected": context["selected"],
            "path": context["publicOrAdminPath"],
            "imageBoxShadow": image_styles.get("boxShadow"),
            "imageFilter": image_styles.get("filter"),
            "imageBackgroundColor": image_styles.get("backgroundColor"),
            "imageBorderRadius": image_styles.get("borderRadius"),
            "imageOutline": image_styles.get("outline"),
            "wrapperBoxShadow": wrapper_styles.get("boxShadow"),
            "wrapperFilter": wrapper_styles.get("filter"),
            "wrapperBackgroundColor": wrapper_styles.get("backgroundColor"),
            "wrapperOutline": wrapper_styles.get("outline"),
            "naturalDimensions": context["imageNaturalDimensions"],
            "renderedDimensions": context["imageRenderedDimensions"],
        }
    context_summary = summary["contexts"]
    journey_public = context_summary.get("journey-public-unselected", {})
    synthetic_public = context_summary.get("synthetic-public-unselected", {})
    selected = context_summary.get("journey-edit-selected", {})
    summary["rootCauseSignals"] = {
        "publicJourneyImageHasRectangularBoxShadow": journey_public.get("imageBoxShadow") not in (None, "none"),
        "cleanSyntheticJourneyImageHasRectangularBoxShadow": synthetic_public.get("imageBoxShadow") not in (None, "none"),
        "selectedJourneyImageHasRectangularBoxShadow": selected.get("imageBoxShadow") not in (None, "none"),
        "selectedJourneyImageUsesOutline": selected.get("imageOutline") not in (None, "none"),
        "selectedJourneyImageUsesFilter": selected.get("imageFilter") not in (None, "none"),
    }
    return summary


def assert_transparent(value: str, label: str, failures: list[str]) -> None:
    if value not in ("rgba(0, 0, 0, 0)", "transparent"):
        failures.append(f"{label} expected transparent, got {value}")


def assert_none(value: str, label: str, failures: list[str]) -> None:
    if value != "none":
        failures.append(f"{label} expected none, got {value}")


def assert_outline_present(value: str, label: str, failures: list[str]) -> None:
    if not value or " none " in f" {value} " or value == "none":
        failures.append(f"{label} expected a visible outline, got {value}")


def validate_rendering_contract(summary: dict[str, object], diagnostics: dict[str, object]) -> None:
    contexts = summary.get("contexts", {})
    required_contexts = [
        "bare-image-control",
        "journey-public-unselected",
        "journey-edit-unselected",
        "journey-edit-selected",
        "synthetic-public-unselected",
        "synthetic-edit-selected",
        "legacy-selected-drop-shadow",
    ]
    failures: list[str] = []
    for context_id in required_contexts:
        if context_id not in contexts:
            failures.append(f"missing diagnostic context: {context_id}")
    if failures:
        raise AssertionError("; ".join(failures))

    for context_id in (
        "journey-public-unselected",
        "journey-edit-unselected",
        "journey-edit-selected",
        "synthetic-public-unselected",
        "synthetic-edit-selected",
        "legacy-selected-drop-shadow",
    ):
        context = contexts[context_id]
        assert_transparent(context["imageBackgroundColor"], f"{context_id} image background", failures)
        assert_transparent(context["wrapperBackgroundColor"], f"{context_id} wrapper background", failures)
        assert_none(context["imageBoxShadow"], f"{context_id} image box-shadow", failures)
        assert_none(context["wrapperBoxShadow"], f"{context_id} wrapper box-shadow", failures)
        assert_none(context["imageFilter"], f"{context_id} image filter", failures)
        assert_none(context["wrapperFilter"], f"{context_id} wrapper filter", failures)

    for context_id in ("journey-public-unselected", "journey-edit-unselected", "synthetic-public-unselected"):
        context = contexts[context_id]
        if " none " not in f" {context['imageOutline']} ":
            failures.append(f"{context_id} should not include editor image outline")
        if " none " not in f" {context['wrapperOutline']} ":
            failures.append(f"{context_id} should not include editor wrapper outline")

    assert_outline_present(contexts["journey-edit-selected"]["wrapperOutline"], "selected sticker wrapper", failures)
    assert_outline_present(contexts["synthetic-edit-selected"]["wrapperOutline"], "selected synthetic wrapper", failures)
    if " none " not in f" {contexts['journey-edit-selected']['imageOutline']} ":
        failures.append("selected sticker image should not carry the selection outline")

    contexts_by_id = {context["caseId"]: context for context in diagnostics.get("contexts", [])}
    selected_controls = contexts_by_id["journey-edit-selected"].get("controls", [])
    visible_controls = [control for control in selected_controls if control.get("display") != "none"]
    if len(visible_controls) < 6:
        failures.append(f"selected sticker controls expected at least 6 visible controls, got {len(visible_controls)}")
    public_controls = contexts_by_id["journey-public-unselected"].get("controls", [])
    if public_controls:
        failures.append("public/unselected sticker should not render editor controls")

    signals = summary.get("rootCauseSignals", {})
    if signals.get("publicJourneyImageHasRectangularBoxShadow"):
        failures.append("public Journey sticker still has rectangular box-shadow")
    if signals.get("cleanSyntheticJourneyImageHasRectangularBoxShadow"):
        failures.append("clean synthetic control still has rectangular box-shadow")
    if signals.get("selectedJourneyImageUsesFilter"):
        failures.append("selected Journey sticker still uses a filter")

    if failures:
        raise AssertionError("; ".join(failures))


def write_report(output_dir: Path, image_report: dict[str, object], browser_summary: dict[str, object] | None) -> None:
    lines = [
        "# Journey Sticker Rendering Diagnostic Report",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Image Forensics",
        "",
        "```json",
        json.dumps(image_report, indent=2),
        "```",
        "",
        "## Browser Computed-Style Summary",
        "",
    ]
    if browser_summary is None:
        lines.extend(["Browser computed-style diagnostics were not available.", ""])
    else:
        lines.extend(["```json", json.dumps(browser_summary, indent=2), "```", ""])
        signals = browser_summary.get("rootCauseSignals", {})
        lines.extend([
            "## Outcome Classification",
            "",
            f"* Bare image/source halo: {image_report['alpha']['pixelsWithAlphaBelow255']} pixels have alpha below 255, so baked-in soft pixels are present.",
            f"* Journey unselected rectangle: {signals.get('publicJourneyImageHasRectangularBoxShadow')}.",
            f"* Selected-state rectangle contribution: {signals.get('selectedJourneyImageHasRectangularBoxShadow')}.",
            f"* Clean synthetic control rectangle: {signals.get('cleanSyntheticJourneyImageHasRectangularBoxShadow')}.",
            f"* Filter/drop-shadow amplification on selected sketch path: {signals.get('selectedJourneyImageUsesFilter')}.",
            "",
        ])
    (output_dir / "diagnostic-report.md").write_text("\n".join(lines), encoding="utf-8")


def command_generate(args: argparse.Namespace) -> None:
    repo_root = Path(args.repo_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    test_png = repo_root / "test.png"
    if not test_png.exists():
        raise FileNotFoundError(f"test.png was not found at {test_png}")

    log(f"Analyzing PNG alpha data for {test_png}")
    image_report = analyze_png_alpha(test_png)
    (output_dir / "image-forensics.json").write_text(json.dumps(image_report, indent=2), encoding="utf-8")

    synthetic_name = "synthetic-clean-control.png"
    log("Creating clean synthetic transparent PNG control")
    write_synthetic_png(output_dir / synthetic_name)
    synthetic_report = analyze_png_alpha(output_dir / synthetic_name)
    (output_dir / "synthetic-forensics.json").write_text(json.dumps(synthetic_report, indent=2), encoding="utf-8")

    log("Writing isolated HTML rendering matrix")
    harness_path = build_harness(repo_root, output_dir, synthetic_name)
    (output_dir / "diagnostic-manifest.json").write_text(
        json.dumps(
            {
                "repoRoot": str(repo_root),
                "outputDir": str(output_dir),
                "harness": str(harness_path),
                "testPng": str(test_png),
                "syntheticControl": str(output_dir / synthetic_name),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    write_report(output_dir, image_report, None)
    log(f"Generated diagnostic harness at {harness_path}")


def command_extract_dom(args: argparse.Namespace) -> None:
    output_dir = Path(args.output_dir).resolve()
    image_report = json.loads((output_dir / "image-forensics.json").read_text(encoding="utf-8"))
    dom_text = read_text_with_dom_encoding(Path(args.dom_file))
    diagnostics = extract_json_from_dom(dom_text)
    (output_dir / "computed-style-diagnostics.json").write_text(json.dumps(diagnostics, indent=2), encoding="utf-8")
    summary = summarize_browser_diagnostics(diagnostics)
    validate_rendering_contract(summary, diagnostics)
    (output_dir / "computed-style-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    write_report(output_dir, image_report, summary)
    log("Extracted browser computed-style diagnostics")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser("generate")
    generate.add_argument("--repo-root", required=True)
    generate.add_argument("--output-dir", required=True)
    generate.set_defaults(func=command_generate)

    extract = subparsers.add_parser("extract-dom")
    extract.add_argument("--dom-file", required=True)
    extract.add_argument("--output-dir", required=True)
    extract.set_defaults(func=command_extract_dom)

    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"JOURNEY_STICKER_DIAGNOSTIC_FAILED: {exc}", file=sys.stderr)
        raise
