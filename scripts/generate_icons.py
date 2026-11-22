import os
import struct
import zlib
import math

def create_png(width, height, draw_fn):
    # RGBA
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = draw_fn(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    # PNG signature
    png = b"\x89PNG\r\n\x1a\n"
    
    # IHDR
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data)
    png += struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
    
    # IDAT
    compressed = zlib.compress(raw_data)
    idat_crc = zlib.crc32(b"IDAT" + compressed)
    png += struct.pack(">I", len(compressed)) + b"IDAT" + compressed + struct.pack(">I", idat_crc)
    
    # IEND
    iend_crc = zlib.crc32(b"IEND")
    png += struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)
    
    return png

def scanline_icon_pixel(x, y, w, h):
    # ScanlineX optical icon: horizontal raster lines with central topographic displacement wave
    # Primary color #f4f4f6 -> (244, 244, 246)
    nx = x / (w - 1)
    ny = y / (h - 1)
    
    # Lines at y positions: 0.25, 0.45, 0.65, 0.85
    lines_y = [0.22, 0.40, 0.60, 0.78]
    line_thickness = max(1.0, w / 23.0 * 1.1)
    
    # Peak displacement in center
    cx = nx - 0.5
    bell = math.exp(-cx * cx * 24.0)
    
    max_alpha = 0.0
    for i, base_y in enumerate(lines_y):
        # Displace upwards in the center
        disp = bell * (0.16 + i * 0.04)
        target_y = (base_y - disp) * h
        dist = abs(y - target_y)
        if dist < line_thickness:
            alpha = 1.0 - (dist / line_thickness)
            if alpha > max_alpha:
                max_alpha = alpha
    
    if max_alpha <= 0.0:
        return (0, 0, 0, 0)
    
    # Clamp and apply smooth antialiasing
    a = int(min(255, max(0, max_alpha * 255)))
    return (244, 244, 246, a)

def main():
    os.makedirs("icons", exist_ok=True)
    
    # 23x23 icon@1x.png and icon.png
    png_23 = create_png(23, 23, scanline_icon_pixel)
    with open("icons/icon@1x.png", "wb") as f:
        f.write(png_23)
    with open("icons/icon.png", "wb") as f:
        f.write(png_23)
        
    # 46x46 icon@2x.png
    png_46 = create_png(46, 46, scanline_icon_pixel)
    with open("icons/icon@2x.png", "wb") as f:
        f.write(png_46)
        
    # 48x48 plugin.png and plugin@1x.png
    png_48 = create_png(48, 48, scanline_icon_pixel)
    with open("icons/plugin.png", "wb") as f:
        f.write(png_48)
    with open("icons/plugin@1x.png", "wb") as f:
        f.write(png_48)
        
    print("Generated all icons successfully!")

if __name__ == "__main__":
    main()
