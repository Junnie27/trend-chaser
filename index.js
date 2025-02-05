const API_KEY = 'AIzaSyB8n5z6QqIuj7-dl1z_EmHDBi2X0kWRpWw'; // Replace with your actual API key
const SEARCH_BASE_URL = 'https://www.googleapis.com/youtube/v3/search';
const CHANNELS_BASE_URL = 'https://www.googleapis.com/youtube/v3/channels';
const PROXY_URL = 'https://corsproxy.io/?';
const CATEGORIES_BASE_URL = 'https://www.googleapis.com/youtube/v3/videoCategories';

// Global variable to store channel data
let channelsData = [];

// Fetch and populate video categories dynamically
async function fetchCategories() {
  try {
    const response = await fetch(`${PROXY_URL}${CATEGORIES_BASE_URL}?part=snippet&regionCode=US&key=${API_KEY}`);
    const data = await response.json();

    if (response.ok && data.items) {
      const categorySelect = document.getElementById("category");
      data.items.forEach(category => {
        let option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.snippet.title;
        categorySelect.appendChild(option);
      });
    } else {
      console.error("Error fetching categories:", data.error?.message || "Unknown error");
    }
  } catch (error) {
    console.error("Network error:", error);
  }
}
// Run fetchCategories on page load
document.addEventListener("DOMContentLoaded", fetchCategories);

async function searchChannels() {
  const query = document.getElementById('query').value.trim();
  const countryFilter = document.getElementById('region').value;
  const categoryFilter = document.getElementById('category').value; // Selected category ID
  const minSubs = document.getElementById('minSubs').value;
  const maxSubs = document.getElementById('maxSubs').value;
  
  // Check if at least one filter is selected (to allow searches without text input)
  if (!query && !countryFilter && !categoryFilter && !minSubs && !maxSubs) {
    alert("Please select at least one filter or enter a search term.");
    return;
  }

  // Build search URL (allowing empty query)
  let searchUrl = `${SEARCH_BASE_URL}?part=snippet&type=channel&key=${API_KEY}&maxResults=25`;
  
  if (query) {
    searchUrl += `&q=${encodeURIComponent(query)}`;
  }

  try {
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (!searchResponse.ok) {
      console.error("Error fetching channels:", searchData.error.message);
      return;
    }
    
    const channelIds = searchData.items.map(item => item.snippet.channelId).filter(id => id).join(',');

    if (!channelIds) {
      document.getElementById("results").innerHTML = "<p>No channels found. Try a different filter.</p>";
      return;
    }
    
    let channelsUrl = `${CHANNELS_BASE_URL}?part=snippet,statistics,contentDetails,brandingSettings&id=${channelIds}&key=${API_KEY}`;
    const channelsResponse = await fetch(channelsUrl);
    const channelsDataJson = await channelsResponse.json();
    
    if (!channelsResponse.ok) {
      console.error("Error fetching channel details:", channelsDataJson.error.message);
      return;
    }
    
    let filteredChannels = channelsDataJson.items;

    // Filter by country
    if (countryFilter) {
      filteredChannels = filteredChannels.filter(channel =>
        channel.snippet.country && channel.snippet.country.toUpperCase() === countryFilter.toUpperCase()
      );
    }

    // Filter by category (category filtering applies to videos, so this may have limited effect on channels)
    if (categoryFilter) {
      filteredChannels = filteredChannels.filter(channel =>
        channel.snippet.categoryId && channel.snippet.categoryId === categoryFilter
      );
    }

    // Filter by subscriber count
    if (minSubs) {
      const minValue = parseInt(minSubs.replace(/,/g, ''), 10);
      filteredChannels = filteredChannels.filter(channel => {
        const subs = parseInt(channel.statistics?.subscriberCount || 0, 10);
        return subs >= minValue;
      });
    }
    if (maxSubs) {
      const maxValue = parseInt(maxSubs.replace(/,/g, ''), 10);
      filteredChannels = filteredChannels.filter(channel => {
        const subs = parseInt(channel.statistics?.subscriberCount || 0, 10);
        return subs <= maxValue;
      });
    }

    channelsData = filteredChannels;
    displayResults(channelsData);

  } catch (error) {
    console.error("Network error:", error);
  }
}

// Expose the searchChannels function globally so it can be triggered from the HTML
window.searchChannels = searchChannels;
