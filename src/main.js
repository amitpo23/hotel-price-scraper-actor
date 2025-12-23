import { Actor } from 'apify';
import { PuppeteerCrawler } from 'apify';
import { createClient } from '@supabase/supabase-js';

await Actor.init();

// Get input from Apify
const input = await Actor.getInput();
const { 
  hotelId,           // Your hotel ID
  hotelUrl,          // Your hotel Booking.com URL
  competitorUrls,    // Array of competitor URLs
  checkIn, 
  checkOut,
  supabaseUrl,       // Supabase URL
  supabaseKey        // Supabase anon key
} = input;

console.log('Starting hotel price scraper...');
console.log('Hotel ID:', hotelId);
console.log('Hotel URL:', hotelUrl);
console.log('Competitors:', competitorUrls?.length || 0);
console.log('Check-in:', checkIn);
console.log('Check-out:', checkOut);

// Initialize Supabase client if credentials provided
let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized');
}

// Helper function to scrape a single hotel
async function scrapeHotel(url, isMainHotel = false) {
  console.log(`Scraping ${isMainHotel ? 'main hotel' : 'competitor'}: ${url}`);
  
  const page = await crawler.browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for price to load
    await page.waitForSelector('[data-testid="price-and-discounted-price"]', { timeout: 30000 });
    
    // Extract hotel data
    const hotelData = await page.evaluate(() => {
      const nameEl = document.querySelector('h2[class*="pp-header"]');
      const priceEl = document.querySelector('[data-testid="price-and-discounted-price"]');
      const ratingEl = document.querySelector('[data-testid="review-score-component"]');
      const addressEl = document.querySelector('[data-testid="address"]');
      
      return {
        name: nameEl?.textContent?.trim() || 'N/A',
        price: priceEl?.textContent?.trim() || 'N/A',
        rating: ratingEl?.textContent?.trim() || 'N/A',
        address: addressEl?.textContent?.trim() || 'N/A',
        url: window.location.href
      };
    });
    
    console.log(`Scraped ${hotelData.name}: ${hotelData.price}`);
    return hotelData;
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, error.message);
    return {
      name: 'Error',
      price: 'N/A',
      rating: 'N/A',
      address: 'N/A',
      url,
      error: error.message
    };
  } finally {
    await page.close();
  }
}

// Create crawler
const crawler = new PuppeteerCrawler({
  launchContext: {
    launchOptions: {
      headless: true,
    },
  },
  maxConcurrency: 1,
});

await crawler.run();

// Scrape main hotel
const mainHotelData = await scrapeHotel(hotelUrl, true);

// Scrape competitors
const competitorsData = [];
if (competitorUrls && competitorUrls.length > 0) {
  for (const competitorUrl of competitorUrls) {
    const competitorData = await scrapeHotel(competitorUrl, false);
    competitorsData.push(competitorData);
  }
}

// Prepare results
const results = {
  hotelId,
  checkIn,
  checkOut,
  scrapedAt: new Date().toISOString(),
  mainHotel: mainHotelData,
  competitors: competitorsData
};

// Save to Apify dataset
await Actor.pushData(results);

// Save to Supabase if configured
if (supabase) {
  console.log('Saving to Supabase...');
  
  try {
    // Save main hotel price
    const { error: mainError } = await supabase
      .from('hotel_prices')
      .insert({
        hotel_id: hotelId,
        check_in: checkIn,
        check_out: checkOut,
        price: mainHotelData.price,
        rating: mainHotelData.rating,
        scraped_at: new Date().toISOString(),
        is_main_hotel: true
      });
    
    if (mainError) {
      console.error('Error saving main hotel:', mainError);
    } else {
      console.log('Main hotel saved to Supabase');
    }
    
    // Save competitor prices
    for (const competitor of competitorsData) {
      const { error: compError } = await supabase
        .from('competitor_prices')
        .insert({
          hotel_id: hotelId,
          competitor_name: competitor.name,
          competitor_url: competitor.url,
          check_in: checkIn,
          check_out: checkOut,
          price: competitor.price,
          rating: competitor.rating,
          scraped_at: new Date().toISOString()
        });
      
      if (compError) {
        console.error(`Error saving competitor ${competitor.name}:`, compError);
      } else {
        console.log(`Competitor ${competitor.name} saved to Supabase`);
      }
    }
  } catch (error) {
    console.error('Supabase save error:', error);
  }
}

console.log('Scraping completed!');
console.log('Main hotel:', mainHotelData.name, mainHotelData.price);
console.log('Competitors scraped:', competitorsData.length);

await Actor.exit();
