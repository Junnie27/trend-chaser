﻿const API_KEY = 'AIzaSyB8n5z6QqIuj7-dl1z_EmHDBi2X0kWRpWw'; // Replace with your actual API key
const SEARCH_BASE_URL = 'https://www.googleapis.com/youtube/v3/search';
const CHANNELS_BASE_URL = 'https://www.googleapis.com/youtube/v3/channels';
const CATEGORIES_BASE_URL = 'https://www.googleapis.com/youtube/v3/videoCategories';

let channelsData = [];
let sortOrder = {
  name: 'asc',
  subs: 'asc',
  views: 'asc',
  videos: 'asc',
  launch: 'asc',
  last12: 'asc',
  memberships: 'asc'
};

// Fetch and populate video categories dynamically
async function fetchCategories() {
  try {
    const response = await fetch(`${CATEGORIES_BASE_URL}?part=snippet&regionCode=US&key=${API_KEY}`);
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
  const categoryFilter = document.getElementById('category').value;
  const minSubs = document.getElementById('minSubs').value;
  const maxSubs = document.getElementById('maxSubs').value;

  if (!query && !countryFilter && !categoryFilter && !minSubs && !maxSubs) {
    alert("Please select at least one filter or enter a search term.");
    return;
  }

  let channelIds = new Set();
  let queryChannelIds = new Set();

  // ✅ Search for videos in the selected category
  if (categoryFilter) {
    let videoSearchUrl = `${SEARCH_BASE_URL}?part=snippet&type=video&videoCategoryId=${categoryFilter}&key=${API_KEY}&maxResults=50`;

    try {
      const videoResponse = await fetch(videoSearchUrl);
      const videoData = await videoResponse.json();

      if (!videoResponse.ok || !videoData.items) {
        console.error("Error fetching videos:", videoData.error?.message);
        return;
      }

      videoData.items.forEach(video => channelIds.add(video.snippet.channelId));
    } catch (error) {
      console.error("Network error:", error);
      return;
    }
  }

  // ✅ Search for channels matching the keyword
  if (query) {
    let searchUrl = `${SEARCH_BASE_URL}?part=snippet&type=channel&q=${encodeURIComponent(query)}&key=${API_KEY}&maxResults=50`;

    try {
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      if (!searchResponse.ok || !searchData.items) {
        console.error("Error fetching channels:", searchData.error?.message);
        return;
      }

      searchData.items.forEach(item => queryChannelIds.add(item.snippet.channelId));
    } catch (error) {
      console.error("Network error:", error);
      return;
    }
  }

  // ✅ Apply AND condition (Only return channels that match BOTH category & keyword)
  if (query && categoryFilter) {
    channelIds = new Set([...channelIds].filter(id => queryChannelIds.has(id)));
  } else {
    channelIds = new Set([...channelIds, ...queryChannelIds]); // Use both sets if one is missing
  }

  if (channelIds.size === 0) {
    document.getElementById("results").innerHTML = "<p>No channels found. Try a different filter.</p>";
    return;
  }

  try {
    let channelsUrl = `${CHANNELS_BASE_URL}?part=snippet,statistics,contentDetails,brandingSettings&id=${[...channelIds].join(",")}&key=${API_KEY}`;
    const channelsResponse = await fetch(channelsUrl);
    const channelsDataJson = await channelsResponse.json();

    if (!channelsResponse.ok) {
      console.error("Error fetching channel details:", channelsDataJson.error.message);
      return;
    }

    let filteredChannels = channelsDataJson.items;

    // ✅ Apply Additional Filters (Country, Subscribers)
    if (countryFilter) {
      filteredChannels = filteredChannels.filter(channel =>
        channel.snippet.country && channel.snippet.country.toUpperCase() === countryFilter.toUpperCase()
      );
    }

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

    // ✅ Fetch video count for the last 12 months
    channelsData = await Promise.all(filteredChannels.map(async channel => {
      channel.videosLast12Months = await getVideosLast12Months(channel);
      return channel;
    }));

    displayResults(channelsData);
  } catch (error) {
    console.error("Network error:", error);
  }
}

// ✅ Fetch videos uploaded in the last 12 months
async function getVideosLast12Months(channel) {
  let count = 0;
  if (!channel.contentDetails?.relatedPlaylists?.uploads) {
    return count;
  }

  const playlistId = channel.contentDetails.relatedPlaylists.uploads;
  let nextPageToken = "";
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

  do {
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${API_KEY}`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) break;

      data.items.forEach(item => {
        const publishedAt = new Date(item.snippet.publishedAt);
        if (publishedAt >= cutoffDate) {
          count++;
        }
      });

      nextPageToken = data.nextPageToken;
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      break;
    }
  } while (nextPageToken);

  return count;
}

// ✅ Sorting function for table headers
function sortResults(field) {
  if (!channelsData || channelsData.length === 0) return;

  sortOrder[field] = sortOrder[field] === "asc" ? "desc" : "asc";

  channelsData.sort((a, b) => {
    let valueA, valueB;

    switch (field) {
      case "name":
        valueA = a.snippet.title.toLowerCase();
        valueB = b.snippet.title.toLowerCase();
        return sortOrder[field] === "asc" ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      case "subs":
      case "views":
      case "videos":
      case "last12":
        valueA = parseInt(a.statistics?.[field] || a[field], 10) || 0;
        valueB = parseInt(b.statistics?.[field] || b[field], 10) || 0;
        break;
      case "launch":
        valueA = new Date(a.snippet.publishedAt);
        valueB = new Date(b.snippet.publishedAt);
        return sortOrder[field] === "asc" ? valueA - valueB : valueB - valueA;
    }

    return sortOrder[field] === "asc" ? valueA - valueB : valueB - valueA;
  });

  displayResults(channelsData);
}

// Expose functions globally
window.searchChannels = searchChannels;
window.sortResults = sortResults;
