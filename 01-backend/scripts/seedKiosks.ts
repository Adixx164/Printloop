import { AppDataSource } from '../config/database';
import { KioskService } from '../services/kiosk.service';

/**
 * Seed script to create initial kiosks for development/testing
 * 
 * Usage:
 * npm run seed:kiosks
 * 
 * Or add to package.json:
 * "scripts": {
 *   "seed:kiosks": "ts-node src/scripts/seedKiosks.ts"
 * }
 */

async function seedKiosks() {
  try {
    // Initialize database connection
    await AppDataSource.initialize();
    console.log('✓ Database connection established');

    const kioskService = new KioskService();

    // Create demo kiosks
    const kiosks = [
      {
        name: 'Main Library Kiosk',
        location: 'University Main Library - Ground Floor',
        campus: 'Main Campus',
        shopId: 'SHOP001',
        printerName: 'HP LaserJet Pro MFP M428fdw',
        printerModel: 'HP M428fdw',
        ipAddress: '192.168.1.100',
        notes: 'Primary kiosk in main library. High traffic area.',
      },
      {
        name: 'Engineering Block Kiosk',
        location: 'Faculty of Engineering - Lobby',
        campus: 'Main Campus',
        shopId: 'SHOP002',
        printerName: 'Canon imageCLASS MF445dw',
        printerModel: 'Canon MF445dw',
        ipAddress: '192.168.1.101',
        notes: 'Engineering students primary access point.',
      },
      {
        name: 'Hostel Common Room Kiosk',
        location: 'Student Hostel A - Common Room',
        campus: 'Residential Area',
        shopId: 'SHOP003',
        printerName: 'Brother HL-L2395DW',
        printerModel: 'Brother HL-L2395DW',
        ipAddress: '192.168.2.50',
        notes: '24/7 access for hostel residents.',
      },
      {
        name: 'Medical Sciences Kiosk',
        location: 'College of Medicine - Library',
        campus: 'Medical Campus',
        shopId: 'SHOP004',
        printerName: 'Xerox VersaLink B405',
        printerModel: 'Xerox B405',
        ipAddress: '192.168.3.20',
        notes: 'Medical students and staff access.',
      },
    ];

    console.log('\nCreating kiosks...\n');

    for (const kioskData of kiosks) {
      const kiosk = await kioskService.createKiosk(kioskData);
      
      console.log(`✓ Created: ${kiosk.name}`);
      console.log(`  Location: ${kiosk.location}`);
      console.log(`  API Key: ${kiosk.apiKey}`);
      console.log(`  Status: ${kiosk.status}`);
      console.log('');
    }

    console.log(`✓ Successfully created ${kiosks.length} kiosks`);
    console.log('\n⚠️  IMPORTANT: Save the API keys above securely!');
    console.log('These keys are needed for kiosk authentication.\n');

    // Close database connection
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed kiosks failed:', error);
    process.exit(1);
  }
}

seedKiosks();
