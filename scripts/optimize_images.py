import os
from PIL import Image
import argparse

def optimize_images(input_dir, output_dir=None):
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    supported_formats = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff')
    
    print(f"Searching for images in: {input_dir}")
    
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith(supported_formats):
                img_path = os.path.join(root, file)
                try:
                    with Image.open(img_path) as img:
                        width, height = img.size
                        original_ratio = width / height
                        
                        changed = False
                        # Landscape logic
                        if width > height:
                            if width > 1920:
                                new_width = 1920
                                new_height = int(new_width / original_ratio)
                                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                                changed = True
                        # Portrait logic
                        else:
                            if height > 1350:
                                new_height = 1350
                                new_width = int(new_height * original_ratio)
                                img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                                changed = True
                        
                        # Prepare output path
                        rel_path = os.path.relpath(img_path, input_dir)
                        base_name = os.path.splitext(rel_path)[0]
                        
                        target_root = output_dir if output_dir else input_dir
                        out_path = os.path.join(target_root, base_name + ".webp")
                        
                        # Ensure subdirectories exist if output_dir is specified
                        os.makedirs(os.path.dirname(out_path), exist_ok=True)
                        
                        # Convert to RGB if necessary (for PNG with alpha or CMYK)
                        if img.mode in ("RGBA", "P"):
                            img = img.convert("RGB")
                            
                        img.save(out_path, "WEBP", quality=85)
                        
                        status = "Resized & Converted" if changed else "Converted"
                        print(f"DONE: {rel_path} -> {os.path.basename(out_path)} ({status})")
                        
                except Exception as e:
                    print(f"FAIL: Failed to process {file}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Optimize images: resize and convert to WebP")
    parser.add_argument("input", help="Input directory containing images")
    parser.add_argument("-o", "--output", help="Output directory (optional, defaults to overwriting/same folder)")
    
    args = parser.parse_args()
    
    # Requirement: Landscape max width 1920, Portrait max height 1350
    optimize_images(args.input, args.output)
