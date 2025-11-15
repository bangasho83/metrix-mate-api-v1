/**
 * @fileoverview HTML Scraper Service - Functions for fetching and parsing HTML content
 * @module services/html-scraper-service
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Browserless API configuration
const BROWSERLESS_API_KEY = 'b7864710-238d-4b8f-b9de-0ae56543025d';
const BROWSERLESS_API_URL = `https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`;

/**
 * Scrapes HTML content from a URL and extracts meta tags, headings, and sitemap information
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} Extracted meta tags, headings, and sitemap information
 */
exports.scrapeUrl = async (url) => {
  try {
    console.log(`Scraping URL: ${url}`);
    
    // Extract domain for robots.txt
    const urlObj = new URL(url);
    const domain = `${urlObj.protocol}//${urlObj.hostname}`;
    const robotsUrl = `${domain}/robots.txt`;
    
    // Get robots.txt and extract sitemap URLs
    let robotsTxtContent = '';
    let sitemapUrls = [];
    
    try {
      console.log(`Fetching robots.txt from: ${robotsUrl}`);
      const robotsResponse = await axios.get(robotsUrl, { timeout: 5000 });
      robotsTxtContent = robotsResponse.data;
      
      // Extract sitemap URLs using regex
      const sitemapMatches = robotsTxtContent.match(/Sitemap:\s*(.*?)($|\n)/gi);
      if (sitemapMatches) {
        sitemapUrls = sitemapMatches.map(match => {
          const url = match.replace(/Sitemap:\s*/i, '').trim();
          return url;
        });
        console.log(`Found ${sitemapUrls.length} sitemap URLs in robots.txt`);
      }
    } catch (robotsError) {
      console.error('Error fetching robots.txt:', robotsError.message);
      robotsTxtContent = `Error: ${robotsError.message}`;
    }
    
    // First try with Browserless for full JavaScript rendering
    try {
      const scrapedData = await scrapeWithBrowserless(url);
      return {
        ...scrapedData,
        robotsTxt: {
          url: robotsUrl,
          content: robotsTxtContent,
          sitemapUrls: sitemapUrls
        }
      };
    } catch (browserlessError) {
      console.error('Browserless scraping failed, falling back to axios:', browserlessError.message);
      // Fall back to axios if Browserless fails
      const scrapedData = await scrapeWithAxios(url);
      return {
        ...scrapedData,
        robotsTxt: {
          url: robotsUrl,
          content: robotsTxtContent,
          sitemapUrls: sitemapUrls
        }
      };
    }
  } catch (error) {
    console.error('Error scraping URL:', {
      message: error.message,
      url,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Scrapes a URL using Browserless API (with JavaScript execution)
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} Extracted data
 */
async function scrapeWithBrowserless(url) {
  try {
    console.log(`Using Browserless API to scrape: ${url}`);
    
    // Configure the Browserless API request with simplified parameters
    const browserlessResponse = await axios.post(
      BROWSERLESS_API_URL,
      {
        url: url,
        gotoOptions: {
          waitUntil: 'networkidle2',
          timeout: 30000
        }
      },
      {
        timeout: 60000, // 60 second timeout for the entire request
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Log response structure for debugging
    console.log('Browserless response received:', {
      status: browserlessResponse.status,
      hasData: !!browserlessResponse.data,
      dataType: typeof browserlessResponse.data
    });
    
    // Get the HTML content
    const html = browserlessResponse.data;
    
    // Verify we have HTML content
    if (!html || typeof html !== 'string') {
      console.error('Invalid HTML content received from Browserless API');
      throw new Error('Invalid HTML content received from Browserless API');
    }
    
    console.log('Browserless scraping successful, processing content');
    
    // Load the HTML into cheerio for easier parsing
    const $ = cheerio.load(html, {
      normalizeWhitespace: true,
      decodeEntities: true
    });
    
    // Extract data using the common extraction function
    return extractDataFromHtml($, html, url);
  } catch (error) {
    console.error('Error in Browserless scraping:', error.message);
    throw error;
  }
}

/**
 * Detects common tracking scripts in the HTML with enhanced detection for Next.js
 * @param {Object} $ - Cheerio instance
 * @param {string} html - Raw HTML content
 * @param {Object|null} nextData - Parsed Next.js data if available
 * @returns {Object} Detected tracking scripts
 */
function detectTrackingScripts($, html, nextData) {
  const scripts = {
    ga4: {
      detected: false,
      id: null,
      details: []
    },
    googleTagManager: {
      detected: false,
      id: null,
      details: []
    },
    metaPixel: {
      detected: false,
      id: null,
      details: []
    },
    googleAdsConversion: {
      detected: false,
      id: null,
      details: []
    }
  };
  
  // Check for GA4 (Google Analytics 4) with multiple patterns
  const ga4Patterns = [
    /gtag\('config',\s*['"]G-([A-Z0-9-]+)['"]\)/g,
    /gtag\("config",\s*["']G-([A-Z0-9-]+)["']\)/g,
    /googletagmanager.*?id=G-([A-Z0-9-]+)/g,
    /"measurementId":\s*["']G-([A-Z0-9-]+)["']/g,
    /G-[A-Z0-9-]{10,}/g,  // Look for G-ID pattern directly
    /window\.gtag/g,       // Check for gtag function
    /window\.__GOOGLE_ANALYTICS_ID__/g, // Common Next.js pattern
    /window\._ga/g         // Another common pattern
  ];
  
  let ga4Detected = false;
  const ga4Ids = new Set();
  
  // Check entire HTML for GA4 patterns (for inline scripts)
  ga4Patterns.forEach(pattern => {
    const matches = html.match(pattern) || [];
    if (matches.length > 0) {
      ga4Detected = true;
      matches.forEach(match => {
        const idMatch = match.match(/G-([A-Z0-9-]+)/);
        if (idMatch && idMatch[0]) {
          ga4Ids.add(idMatch[0]);
        }
      });
    }
  });
  
  // Check for GA4 in Next.js data
  if (nextData) {
    // Common patterns in Next.js config
    if (nextData.buildId && html.includes('G-')) {
      const gaMatch = html.match(/G-[A-Z0-9-]{10,}/g);
      if (gaMatch) {
        ga4Detected = true;
        gaMatch.forEach(id => ga4Ids.add(id));
      }
    }
    
    // Check for GA in Next.js config
    if (nextData.runtimeConfig && nextData.runtimeConfig.googleAnalytics) {
      ga4Detected = true;
      const gaId = nextData.runtimeConfig.googleAnalytics.measurementId;
      if (gaId && gaId.startsWith('G-')) {
        ga4Ids.add(gaId);
      }
    }
  }
  
  // Check script tags content
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    const scriptSrc = $(el).attr('src') || '';
    
    // Check for GA4
    ga4Patterns.forEach(pattern => {
      const matches = scriptContent.match(pattern) || [];
      if (matches.length > 0) {
        ga4Detected = true;
        matches.forEach(match => {
          const idMatch = match.match(/G-([A-Z0-9-]+)/);
          if (idMatch && idMatch[0]) {
            ga4Ids.add(idMatch[0]);
          }
        });
      }
    });
    
    // Check script src for GA4
    if (scriptSrc.includes('googletagmanager') || scriptSrc.includes('google-analytics')) {
      ga4Detected = true;
      const idMatch = scriptSrc.match(/G-([A-Z0-9-]+)/);
      if (idMatch && idMatch[0]) {
        ga4Ids.add(idMatch[0]);
      }
    }
    
    // Check for Google Tag Manager in script content
    if (scriptContent.includes('dataLayer') || 
        scriptContent.includes('gtm.js') || 
        scriptSrc.includes('googletagmanager.com/gtm.js')) {
      scripts.googleTagManager.detected = true;
      
      // Extract GTM ID
      const gtmIdMatch = (scriptContent.match(/GTM-[A-Z0-9]+/g) || [])
        .concat(scriptSrc.match(/GTM-[A-Z0-9]+/g) || []);
      
      if (gtmIdMatch.length > 0) {
        gtmIdMatch.forEach(id => {
          if (!scripts.googleTagManager.details.includes(id)) {
            scripts.googleTagManager.details.push(id);
          }
        });
        scripts.googleTagManager.id = scripts.googleTagManager.details[0];
      }
    }
    
    // Check for Meta Pixel in script content
    if (scriptContent.includes('fbq(') || 
        scriptContent.includes('facebook-pixel') || 
        scriptContent.includes('fbevents.js') || 
        scriptSrc.includes('connect.facebook.net')) {
      scripts.metaPixel.detected = true;
      
      // Extract Meta Pixel ID
      const pixelIdMatches = scriptContent.match(/fbq\(['"]init['"],\s*['"](\d+)['"]\)/g) || 
                             scriptContent.match(/pixel_id=(\d+)/g) || 
                             scriptContent.match(/fbq\(['"]init['"],['"](\d+)['"]\)/g);
      
      if (pixelIdMatches) {
        pixelIdMatches.forEach(match => {
          const idMatch = match.match(/(\d{15,})/);
          if (idMatch && idMatch[1] && !scripts.metaPixel.details.includes(idMatch[1])) {
            scripts.metaPixel.details.push(idMatch[1]);
          }
        });
        
        if (scripts.metaPixel.details.length > 0) {
          scripts.metaPixel.id = scripts.metaPixel.details[0];
        }
      }
    }
    
    // Check for Google Ads Conversion
    if (scriptContent.includes('google_conversion_id') || 
        scriptContent.includes('googleadservices.com/pagead/conversion') || 
        scriptSrc.includes('googleadservices.com')) {
      scripts.googleAdsConversion.detected = true;
      
      // Extract Google Ads ID
      const adsIdMatches = scriptContent.match(/google_conversion_id\s*=\s*(\d+)/g) || 
                           scriptSrc.match(/conversion_id=(\d+)/g);
      
      if (adsIdMatches) {
        adsIdMatches.forEach(match => {
          const idMatch = match.match(/(\d+)/);
          if (idMatch && idMatch[1] && !scripts.googleAdsConversion.details.includes(idMatch[1])) {
            scripts.googleAdsConversion.details.push(idMatch[1]);
          }
        });
        
        if (scripts.googleAdsConversion.details.length > 0) {
          scripts.googleAdsConversion.id = scripts.googleAdsConversion.details[0];
        }
      }
    }
  });
  
  // Set GA4 detection results
  if (ga4Detected || ga4Ids.size > 0) {
    scripts.ga4.detected = true;
    scripts.ga4.details = Array.from(ga4Ids);
    if (scripts.ga4.details.length > 0) {
      scripts.ga4.id = scripts.ga4.details[0];
    }
  }
  
  // Check for GTM in noscript tags (common implementation)
  $('noscript').each((i, el) => {
    const content = $(el).html() || '';
    if (content.includes('googletagmanager.com/ns.html')) {
      scripts.googleTagManager.detected = true;
      
      const idMatch = content.match(/GTM-[A-Z0-9]+/);
      if (idMatch && idMatch[0] && !scripts.googleTagManager.details.includes(idMatch[0])) {
        scripts.googleTagManager.details.push(idMatch[0]);
        if (!scripts.googleTagManager.id) {
          scripts.googleTagManager.id = idMatch[0];
        }
      }
    }
  });
  
  // If we still haven't found GA4 but there are other indicators
  if (!scripts.ga4.detected) {
    // Check for common GA4 implementation patterns
    if (html.includes('www.googletagmanager.com/gtag/js') || 
        html.includes('function gtag(){dataLayer.push(arguments)}') ||
        $('script[src*="googletagmanager.com/gtag/js"]').length > 0) {
      scripts.ga4.detected = true;
    }
  }
  
  // If we still haven't found Meta Pixel but there are other indicators
  if (!scripts.metaPixel.detected) {
    if (html.includes('connect.facebook.net/en_US/fbevents.js') ||
        html.includes('fbq(\'init\'') ||
        html.includes('fbq("init"')) {
      scripts.metaPixel.detected = true;
    }
  }
  
  return scripts;
}

/**
 * Extracts structured data from the HTML (JSON-LD, Microdata, RDFa) with enhanced detection
 * @param {Object} $ - Cheerio instance
 * @param {string} html - Raw HTML content
 * @param {Object|null} nextData - Parsed Next.js data if available
 * @returns {Object} Extracted structured data
 */
function extractStructuredData($, html, nextData) {
  const structuredData = {
    jsonLd: {
      detected: false,
      items: []
    },
    microdata: {
      detected: false,
      itemTypes: []
    },
    rdfa: {
      detected: false,
      types: []
    }
  };
  
  // Extract JSON-LD with enhanced detection
  try {
    // Look for standard JSON-LD scripts
    const jsonLdScripts = $('script[type="application/ld+json"]');
    
    // Also look for scripts that might contain JSON-LD but don't have the correct type
    const potentialJsonLdScripts = $('script:not([type="application/ld+json"])').filter((i, el) => {
      const content = $(el).html() || '';
      return content.includes('@context') && 
             content.includes('schema.org') && 
             (content.includes('@type') || content.includes('@graph'));
    });
    
    const allScripts = jsonLdScripts.length > 0 ? jsonLdScripts : potentialJsonLdScripts;
    
    if (allScripts.length > 0) {
      structuredData.jsonLd.detected = true;
      
      allScripts.each((i, el) => {
        try {
          const content = $(el).html();
          if (content) {
            // Clean the content - sometimes there are comments or non-JSON characters
            const cleanedContent = content
              .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
              .replace(/\/\/.*/g, '')           // Remove single line comments
              .trim();
            
            if (cleanedContent) {
              let parsed;
              try {
                parsed = JSON.parse(cleanedContent);
              } catch (e) {
                // Try to extract JSON from the string if direct parsing fails
                const jsonMatch = cleanedContent.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
                if (jsonMatch && jsonMatch[0]) {
                  parsed = JSON.parse(jsonMatch[0]);
                }
              }
              
              if (parsed) {
                // Extract the @type for summary
                let type = null;
                if (parsed['@type']) {
                  type = parsed['@type'];
                } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]['@type']) {
                  type = parsed[0]['@type'];
                } else if (parsed['@graph'] && Array.isArray(parsed['@graph']) && parsed['@graph'].length > 0) {
                  type = parsed['@graph'].map(item => item['@type']).filter(Boolean);
                }
                
                structuredData.jsonLd.items.push({
                  type: type,
                  content: parsed
                });
              }
            }
          }
        } catch (e) {
          console.error('Error parsing JSON-LD:', e.message);
        }
      });
    }
  } catch (e) {
    console.error('Error extracting JSON-LD:', e.message);
  }
  
  // Extract Microdata with enhanced detection
  try {
    // Standard itemscope detection
    const microdataItems = $('[itemscope]');
    
    // Also check for elements with schema.org in itemtype
    const schemaItems = $('[itemtype*="schema.org"]');
    
    if (microdataItems.length > 0 || schemaItems.length > 0) {
      structuredData.microdata.detected = true;
      
      // Process standard itemscope elements
      microdataItems.each((i, el) => {
        const itemType = $(el).attr('itemtype');
        if (itemType && !structuredData.microdata.itemTypes.includes(itemType)) {
          structuredData.microdata.itemTypes.push(itemType);
        }
      });
      
      // Process schema.org elements
      schemaItems.each((i, el) => {
        const itemType = $(el).attr('itemtype');
        if (itemType && !structuredData.microdata.itemTypes.includes(itemType)) {
          structuredData.microdata.itemTypes.push(itemType);
        }
      });
    }
  } catch (e) {
    console.error('Error extracting Microdata:', e.message);
  }
  
  // Extract RDFa with enhanced detection
  try {
    // Standard typeof detection
    const rdfaItems = $('[typeof]');
    
    // Also check for elements with property and resource attributes
    const rdfaPropertyItems = $('[property][resource]');
    
    if (rdfaItems.length > 0 || rdfaPropertyItems.length > 0) {
      structuredData.rdfa.detected = true;
      
      // Process standard typeof elements
      rdfaItems.each((i, el) => {
        const type = $(el).attr('typeof');
        if (type && !structuredData.rdfa.types.includes(type)) {
          structuredData.rdfa.types.push(type);
        }
      });
      
      // Process property/resource elements
      rdfaPropertyItems.each((i, el) => {
        const property = $(el).attr('property');
        if (property && property.includes(':') && !structuredData.rdfa.types.includes(property)) {
          structuredData.rdfa.types.push(property);
        }
      });
    }
  } catch (e) {
    console.error('Error extracting RDFa:', e.message);
  }
  
  return structuredData;
}

/**
 * Scrapes a URL using Axios (without JavaScript execution)
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} Extracted data
 */
async function scrapeWithAxios(url) {
  try {
    console.log(`Using Axios to scrape: ${url}`);
    
    // Configure Axios request
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    
    // Get the HTML content
    const html = response.data;
    
    // Verify we have HTML content
    if (!html || typeof html !== 'string') {
      console.error('Invalid HTML content received from Axios');
      throw new Error('Invalid HTML content received from Axios');
    }
    
    console.log('Axios scraping successful, processing content');
    
    // Load the HTML into cheerio for easier parsing
    const $ = cheerio.load(html, {
      normalizeWhitespace: true,
      decodeEntities: true
    });
    
    // Extract data using the common extraction function
    return extractDataFromHtml($, html, url);
  } catch (error) {
    console.error('Error in Axios scraping:', error.message);
    throw error;
  }
}

/**
 * Extract data from HTML content using Cheerio
 * @param {Object} $ - Cheerio instance
 * @param {string} html - Raw HTML content
 * @param {string} url - Original URL
 * @returns {Object} Extracted data
 */
function extractDataFromHtml($, html, url) {
  // Extract basic meta tags with fallbacks
  const metaTags = {
    title: $('title').text().trim() || $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || '',
    description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || '',
    canonical: $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || url
  };
  
  // Extract Open Graph meta tags with more robust selectors
  const ogTags = {
    'og:title': $('meta[property="og:title"]').attr('content') || metaTags.title || '',
    'og:description': $('meta[property="og:description"]').attr('content') || metaTags.description || '',
    'og:image': $('meta[property="og:image"]').attr('content') || $('meta[property="og:image:url"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '',
    'og:url': $('meta[property="og:url"]').attr('content') || metaTags.canonical || '',
    'og:type': $('meta[property="og:type"]').attr('content') || 'website',
    'og:site_name': $('meta[property="og:site_name"]').attr('content') || ''
  };
  
  // Extract Twitter meta tags with more robust selectors
  const twitterTags = {
    'twitter:title': $('meta[name="twitter:title"]').attr('content') || $('meta[property="twitter:title"]').attr('content') || ogTags['og:title'] || '',
    'twitter:description': $('meta[name="twitter:description"]').attr('content') || $('meta[property="twitter:description"]').attr('content') || ogTags['og:description'] || '',
    'twitter:image': $('meta[name="twitter:image"]').attr('content') || $('meta[name="twitter:image:src"]').attr('content') || $('meta[property="twitter:image"]').attr('content') || ogTags['og:image'] || '',
    'twitter:card': $('meta[name="twitter:card"]').attr('content') || $('meta[property="twitter:card"]').attr('content') || 'summary',
    'twitter:site': $('meta[name="twitter:site"]').attr('content') || $('meta[property="twitter:site"]').attr('content') || '',
    'twitter:creator': $('meta[name="twitter:creator"]').attr('content') || $('meta[property="twitter:creator"]').attr('content') || ''
  };
  
  // Extract headings - STRICT VERSION: only use actual HTML heading tags
  const headings = {
    h1: [],
    h2: [],
    h3: []
  };
  
  // Process headings - only use actual HTML heading tags
  $('h1').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && !headings.h1.includes(text)) {
      headings.h1.push(text);
      console.log(`Found h1 tag:`, text);
    }
  });
  
  $('h2').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && !headings.h2.includes(text)) {
      headings.h2.push(text);
      console.log(`Found h2 tag:`, text);
    }
  });
  
  $('h3').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && !headings.h3.includes(text)) {
      headings.h3.push(text);
      console.log(`Found h3 tag:`, text);
    }
  });
  
  // Detect tracking scripts from HTML
  const trackingScripts = detectTrackingScripts($, html, null);
  
  // Extract structured data
  const structuredData = extractStructuredData($, html, null);
  
  // Look for sitemap links in the HTML itself (as a backup)
  const htmlSitemapUrls = [];
  $('a[href*="sitemap"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && (href.endsWith('.xml') || href.includes('sitemap'))) {
      const sitemapUrl = new URL(href, url).href;
      htmlSitemapUrls.push(sitemapUrl);
      console.log('Found sitemap link in HTML:', sitemapUrl);
    }
  });
  
  return {
    url,
    metaTags,
    ogTags,
    twitterTags,
    headings,
    trackingScripts,
    structuredData,
    htmlSitemapUrls
  };
}
