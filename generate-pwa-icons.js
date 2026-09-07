const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// Define the required icon sizes
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Function to generate all required icons
async function generatePwaIcons(sourceImagePath) {
  try {
    // Check if source image exists
    await fs.access(sourceImagePath);
    
    // Create icons directory if it doesn't exist
    const iconsDir = path.join(__dirname, 'public', 'icons');
    try {
      await fs.access(iconsDir);
    } catch {
      await fs.mkdir(iconsDir, { recursive: true });
    }
    
    console.log(`Generating PWA icons from ${sourceImagePath}...`);
    
    // Generate each required size
    for (const size of iconSizes) {
      const outputFileName = `icon-${size}x${size}.png`;
      const outputPath = path.join(iconsDir, outputFileName);
      
      await sharp(sourceImagePath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Created ${outputFileName}`);
    }
    
    console.log('\nAll PWA icons generated successfully!');
    console.log('You can now deploy your PWA with the complete icon set.');
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('Error: Source image not found. Please provide a valid image path.');
      console.log('\nTo use this script:');
      console.log('1. Place your source image in the project directory');
      console.log('2. Run: node generate-pwa-icons.js path/to/your/image.png');
    } else {
      console.error('Error generating icons:', error.message);
    }
  }
}

// Get source image path from command line arguments
const sourceImagePath = process.argv[2];

if (!sourceImagePath) {
  console.log('PWA Icon Generator');
  console.log('==================');
  console.log('This script generates all required PWA icons from a source image.\n');
  console.log('Usage: node generate-pwa-icons.js path/to/source/image.png\n');
  console.log('The generated icons will be placed in the public/icons directory.');
  process.exit(0);
}

// Generate the icons
generatePwaIcons(sourceImagePath);
