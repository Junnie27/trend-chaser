﻿const API_KEY = 'AIzaSyCw0mJo6zqiwRorN9-4NUiyVsHTqgjP8tY'; // Replace with your actual API key
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

  // ✅ If Category is selected, search for videos in that category
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

  // ✅ If a keyword is present, search for channels with that keyword
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

    channelsData = await Promise.all(filteredChannels.map(async channel => {
      channel.videosLast12Months = await getVideosLast12Months(channel);
      return channel;
    }));

    displayResults(channelsData);
  } catch (error) {
    console.error("Network error:", error);
  }
}

// ✅ Function to fetch videos uploaded in the last 12 months
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
    let valueA = a[field] || 0;
    let valueB = b[field] || 0;

    return sortOrder[field] === "asc" ? valueA - valueB : valueB - valueA;
  });

  displayResults(channelsData);
}

// ✅ Function to display search results in a table
function displayResults(channels) {
  const resultsContainer = document.getElementById("results");
  resultsContainer.innerHTML = `
    <table>
      <thead>
        <tr>
          <th onclick="sortResults('name')">Channel Name</th>
          <th onclick="sortResults('subs')">Subscribers</th>
          <th onclick="sortResults('views')">Views</th>
          <th onclick="sortResults('videos')">Video Count</th>
          <th onclick="sortResults('launch')">Launch Date</th>
          <th onclick="sortResults('last12')">Videos Last 12 Months</th>
          <th onclick="sortResults('memberships')">Memberships Enabled</th>
        </tr>
      </thead>
      <tbody>
        ${channels.map(channel => `
          <tr>
            <td>${channel.snippet.title}</td>
            <td>${channel.statistics.subscriberCount}</td>
            <td>${channel.statistics.viewCount}</td>
            <td>${channel.statistics.videoCount}</td>
            <td>${new Date(channel.snippet.publishedAt).toLocaleDateString()}</td>
            <td>${channel.videosLast12Months}</td>
            <td>${channel.brandingSettings?.channel?.membershipsEnabled ? "Yes" : "No"}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Expose functions globally
window.searchChannels = searchChannels;
window.sortResults = sortResults;
