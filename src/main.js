import { Actor } from 'apify';
import { PuppeteerCrawler } from 'apify';

await Actor.init();

// Get input from Apify
const input = await Actor.getInput();
const { searchUrl, checkIn, checkOut } = input;

console.log('Starting hotel price scraper...');
console.log('Search URL:', searchUrl);
console.log('Check-in:', checkIn);
console.log('Check-out:', checkOut);

// Create crawler
const crawler = new PuppeteerCrawler({
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },
    async requestHandler({ page, request }) {
        console.log(`Processing ${request.url}`);
        
        // Wait for hotels to load
        await page.waitForSelector('[data-testid="property-card"]', { timeout: 30000 });
        
        // Extract hotel data
        const hotels = await page.$$eval('[data-testid="property-card"]', (elements) => {
            return elements.slice(0, 10).map((el) => {
                const nameEl = el.querySelector('[data-testid="title"]');
                const priceEl = el.querySelector('[data-testid="price-and-discounted-price"]');
                const ratingEl = el.querySelector('[data-testid="review-score"]');
                
                return {
                    name: nameEl?.textContent?.trim() || 'N/A',
                    price: priceEl?.textContent?.trim() || 'N/A',
                    rating: ratingEl?.textContent?.trim() || 'N/A',
                    url: el.querySelector('a')?.href || ''
                };
            });
        });
        
        console.log(`Found ${hotels.length} hotels`);
        
        // Push results to dataset
        await Actor.pushData({
            searchUrl: request.url,
            checkIn,
            checkOut,
            scrapedAt: new Date().toISOString(),
            hotels
        });
    },
    maxRequestsPerCrawl: 1,
});

// Run the crawler
await crawler.run([searchUrl]);

console.log('Scraping completed!');
await Actor.exit();
