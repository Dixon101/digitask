# PWA Icon Generation Instructions

This document explains how to generate the required PWA icons for the Digitask platform.

## Prerequisites

1. Node.js installed on your system
2. A source image for the app icon (logo or brand image)

## Option 1: Using the Provided HTML Logo

1. Open `digitask-logo.html` in a web browser
2. Take a screenshot of the logo (512x512 pixels)
3. Save the screenshot as `digitask-logo.png` in the project root directory

## Option 2: Using Your Own Logo

1. Prepare your logo image (PNG, JPG, or SVG format)
2. Place it in the project root directory
3. Rename it to `source-logo.png` (or any name you prefer)

## Generating the Icons

1. Install the required dependencies:
   ```
   npm install
   ```

2. Run the icon generation script:
   ```
   node generate-pwa-icons.js digitask-logo.png
   ```
   
   Or if using your own logo:
   ```
   node generate-pwa-icons.js source-logo.png
   ```

## Output

The script will generate all required icon sizes and place them in the `public/icons` directory:
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

## Verification

After generating the icons, you can verify they were created correctly by:
1. Checking the `public/icons` directory
2. Testing the PWA installation on a mobile device
3. Using browser developer tools to check the manifest.json file

## Troubleshooting

If you encounter any issues:
1. Ensure Node.js is properly installed
2. Check that the source image path is correct
3. Verify you have write permissions to the `public/icons` directory
4. Make sure all required dependencies are installed
