#!/usr/bin/env python3
"""
Convert monochrome icon to white on transparent background for Android themed icons.
"""
from PIL import Image
import sys

def fix_monochrome_icon(input_path, output_path):
    # Open the image
    img = Image.open(input_path)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Get pixel data
    pixels = img.load()
    width, height = img.size
    
    # Create new image
    new_img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    new_pixels = new_img.load()
    
    # Convert: any non-transparent pixel becomes white
    # Black pixels become white, preserve transparency
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            # If pixel has any opacity, make it white
            if a > 0:
                # Invert the grayscale value to make black -> white
                # For monochrome, we want all visible pixels to be white
                new_pixels[x, y] = (255, 255, 255, a)
            else:
                # Keep transparent
                new_pixels[x, y] = (0, 0, 0, 0)
    
    # Save the result
    new_img.save(output_path, 'PNG')
    print(f"✓ Converted {input_path} to white monochrome icon")
    print(f"✓ Saved to {output_path}")

if __name__ == '__main__':
    input_file = 'assets/images/android-icon-monochrome.png'
    output_file = 'assets/images/android-icon-monochrome.png'
    
    fix_monochrome_icon(input_file, output_file)
