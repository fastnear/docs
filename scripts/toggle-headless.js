#!/usr/bin/env node

/**
 * Toggle between headless (embedded) and full portal mode
 * Usage: node scripts/toggle-headless.js [headless|portal]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REDOCLY_CONFIG = path.join(__dirname, '..', 'redocly.yaml');

function toggleHeadless(mode = 'headless') {
  try {
    // Read current config
    const config = yaml.load(fs.readFileSync(REDOCLY_CONFIG, 'utf8'));
    
    if (mode === 'headless') {
      // Hide all chrome for embedding
      config.sidebar = { hide: true };
      config.navbar = { hide: true };
      config.feedback = { hide: true };
      config.breadcrumbs = { hide: true };
      config.navigation = {
        previousButton: { hide: true },
        nextButton: { hide: true }
      };
      
      console.log('✅ Switched to HEADLESS mode (for embedding)');
    } else {
      // Show chrome for standalone portal
      config.sidebar = { 
        hide: false,
        linePosition: 'bottom'
      };
      config.navbar = { 
        hide: false,
        items: [
          { page: 'docs/snapshots.md', label: 'Docs Home' },
          { label: 'Status', href: 'https://status.fastnear.com', external: true },
          { label: 'Subscriptions', href: 'https://subscriptions.fastnear.com', external: true },
          { label: 'FastNEAR Company', href: 'https://fastnear.com', external: true }
        ]
      };
      config.feedback = { hide: false };
      config.breadcrumbs = { hide: false };
      delete config.navigation;
      
      console.log('✅ Switched to PORTAL mode (standalone)');
    }
    
    // Write updated config
    fs.writeFileSync(REDOCLY_CONFIG, yaml.dump(config, { indent: 2 }));
    
    console.log(`Updated: ${REDOCLY_CONFIG}`);
    console.log('Restart preview server to see changes');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get mode from command line
const mode = process.argv[2] || 'headless';
if (!['headless', 'portal'].includes(mode)) {
  console.error('Usage: node toggle-headless.js [headless|portal]');
  process.exit(1);
}

toggleHeadless(mode);