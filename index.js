const API_KEY = 'AIzaSyAFWMGGG2pg8bSYMNPpwKkCk00-dv5fir4'; // Replace with your actual API key
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
  const loadingIndicator = document.getElementById("loading");
  const resultsContainer = document.getElementById("results");

  if (!query && !countryFilter && !categoryFilter && !minSubs && !maxSubs) {
    alert("Please select at least one filter or enter a search term.");
    return;
  }

  // ✅ Show loading indicator & clear previous results
  loadingIndicator.style.display = "block";
  tea.style.height = "0%"; // Reset tea level
    setTimeout(() => {
    tea.style.height = "100%"; // Fill the tea cup
  }, 500); // Start filling animation after 0.5 seconds

  resultsContainer.innerHTML = "";

  try {
    let channelIds = new Set();

    // ✅ Step 1: Search for Videos (by tags)
    let videoSearchUrl = `${SEARCH_BASE_URL}?part=snippet&type=video&q=${encodeURIComponent(query)}&key=${API_KEY}&maxResults=50`;
    const videoResponse = await fetch(videoSearchUrl);
    const videoData = await videoResponse.json();

    if (!videoResponse.ok || !videoData.items) {
      console.error("Error fetching videos:", videoData.error?.message);
      loadingIndicator.style.display = "none"; // ✅ Hide loading on error
      return;
    }
    videoData.items.forEach(video => channelIds.add(video.snippet.channelId));

    // ✅ Step 2: If category is selected, search for category videos
    if (categoryFilter) {
      let categorySearchUrl = `${SEARCH_BASE_URL}?part=snippet&type=video&videoCategoryId=${categoryFilter}&key=${API_KEY}&maxResults=50`;
      const categoryResponse = await fetch(categorySearchUrl);
      const categoryData = await categoryResponse.json();

      if (!categoryResponse.ok || !categoryData.items) {
        console.error("Error fetching category videos:", categoryData.error?.message);
        loadingIndicator.style.display = "none"; // ✅ Hide loading on error
        return;
      }
      categoryData.items.forEach(video => channelIds.add(video.snippet.channelId));
    }

    if (channelIds.size === 0) {
      resultsContainer.innerHTML = "<p>No channels found based on video topics.</p>";
      loadingIndicator.style.display = "none"; // ✅ Hide loading if no results
      return;
    }

    // ✅ Step 3: Fetch channel details from extracted channel IDs
    let channelsUrl = `${CHANNELS_BASE_URL}?part=snippet,statistics,contentDetails,brandingSettings&id=${[...channelIds].join(",")}&key=${API_KEY}`;
    const channelsResponse = await fetch(channelsUrl);
    const channelsDataJson = await channelsResponse.json();

    if (!channelsResponse.ok) {
      console.error("Error fetching channel details:", channelsDataJson.error.message);
      loadingIndicator.style.display = "none"; // ✅ Hide loading on error
      return;
    }

    let filteredChannels = channelsDataJson.items;

    // ✅ Step 4: Apply Filters (Country, Subscribers)
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

    // ✅ Step 5: Fetch video duration and process data
    channelsData = await Promise.all(filteredChannels.map(async channel => {
      let { count, videoIds } = await getVideosLast12Months(channel);
      channel.videosLast12Months = count;
      channel.averageVideoDuration = await getAverageVideoDuration(videoIds);
      return channel;
    }));

    // ✅ Hide loading indicator & show results
    loadingIndicator.style.display = "none";
    displayResults(channelsData);
  } catch (error) {
    console.error("Network error:", error);
    loadingIndicator.style.display = "none"; // ✅ Hide loading if an error occurs
  }
}

// ✅ Function to fetch videos uploaded in the last 12 months
async function getVideosLast12Months(channel) {
  let count = 0;
  let videoIds = [];
  
  if (!channel.contentDetails?.relatedPlaylists?.uploads) {
    return { count, videoIds };
  }

  const playlistId = channel.contentDetails.relatedPlaylists.uploads;
  let nextPageToken = "";
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);

  do {
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=20&key=${API_KEY}`;
    if (nextPageToken) url += `&pageToken=${nextPageToken}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) break;

      data.items.forEach(item => {
        const publishedAt = new Date(item.snippet.publishedAt);
        if (publishedAt >= cutoffDate) {
          count++;
          videoIds.push(item.snippet.resourceId.videoId);
        }
      });

      nextPageToken = data.nextPageToken;
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      break;
    }
  } while (nextPageToken);

  return { count, videoIds };
}

// ✅ Function to Fetch Video Durations
async function getAverageVideoDuration(videoIds) {
  if (videoIds.length === 0) return "N/A"; // No videos found

  let totalDuration = 0;
  let count = 0;
  let nextBatch = 0;

  while (nextBatch < videoIds.length) {
    const batchIds = videoIds.slice(nextBatch, nextBatch + 50).join(",");
    nextBatch += 50;

    let url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batchIds}&key=${API_KEY}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok || !data.items) break;

      data.items.forEach(video => {
        const duration = video.contentDetails.duration;
        const seconds = parseISO8601Duration(duration);

        // ✅ Exclude videos that are 180 seconds (3 minutes) or less
        if (seconds > 180) {
          totalDuration += seconds;
          count++;
        }
      });
    } catch (error) {
      console.error("Error fetching video durations:", error);
      break;
    }
  }

  return count > 0 ? formatDuration(totalDuration / count) : "N/A"; // Average in HH:MM:SS
}


// ✅ Function to Convert YouTube's ISO 8601 Format (PT4M20S) to Seconds
function parseISO8601Duration(duration) {
  let match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  let hours = match[1] ? parseInt(match[1]) : 0;
  let minutes = match[2] ? parseInt(match[2]) : 0;
  let seconds = match[3] ? parseInt(match[3]) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// ✅ Since the average video duration is in HH:MM:SS format, we need to convert it into seconds before sorting.
function durationToSeconds(duration) {
  if (!duration || duration === "N/A") return 0; // Handle missing values
  let parts = duration.split(":").map(Number);
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1]; // MM:SS
  } else {
    return parts[0]; // SS (unlikely)
  }
}

// Convert seconds to HH:MM:SS format
function formatDuration(seconds) {
  let hours = Math.floor(seconds / 3600);
  let minutes = Math.floor((seconds % 3600) / 60);
  let secs = Math.floor(seconds % 60);
  return `${hours > 0 ? hours + ":" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

// ✅ Sorting function for table headers
function sortResults(field) {
  if (!channelsData || channelsData.length === 0) return;

  // Toggle sorting order (ascending ⇄ descending)
  sortOrder[field] = sortOrder[field] === "asc" ? "desc" : "asc";

  channelsData.sort((a, b) => {
    let valueA, valueB;

    switch (field) {
      // ✅ Name Sorting (Alphabetical)
      case "name":
        valueA = a.snippet.title.toLowerCase();
        valueB = b.snippet.title.toLowerCase();
        return sortOrder[field] === "asc"
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);

      // ✅ Date Sorting (Convert String to Date)
      case "launch":
        valueA = new Date(a.snippet.publishedAt);
        valueB = new Date(b.snippet.publishedAt);
        return sortOrder[field] === "asc" ? valueA - valueB : valueB - valueA;

      // ✅ Number Sorting (Subscribers, Views, Videos, Last 12 Months)
      case "subs":
        valueA = parseInt(a.statistics?.subscriberCount?.toString().replace(/,/g, ""), 10) || 0;
        valueB = parseInt(b.statistics?.subscriberCount?.toString().replace(/,/g, ""), 10) || 0;
        break;

      case "views":
        valueA = parseInt(a.statistics?.viewCount?.toString().replace(/,/g, ""), 10) || 0;
        valueB = parseInt(b.statistics?.viewCount?.toString().replace(/,/g, ""), 10) || 0;
        break;

      case "videos":
        valueA = parseInt(a.statistics?.videoCount?.toString().replace(/,/g, ""), 10) || 0;
        valueB = parseInt(b.statistics?.videoCount?.toString().replace(/,/g, ""), 10) || 0;
        break;

      case "last12":
        valueA = parseInt(a.videosLast12Months?.toString().replace(/,/g, ""), 10) || 0;
        valueB = parseInt(b.videosLast12Months?.toString().replace(/,/g, ""), 10) || 0;
        break;

      // ✅ Sorting Average Video Duration
      case "avgDuration":
        valueA = durationToSeconds(a.averageVideoDuration);
        valueB = durationToSeconds(b.averageVideoDuration);
        break;

      // ✅ Memberships Sorting (Yes/No as Boolean)
      case "memberships":
        valueA = a.brandingSettings?.channel?.membershipsEnabled ? 1 : 0;
        valueB = b.brandingSettings?.channel?.membershipsEnabled ? 1 : 0;
        break;

      default:
        return 0;
    }

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
          <th onclick="sortResults('avgDuration')">Avg Video Duration</th>
          <th onclick="sortResults('memberships')">Memberships Enabled</th>
        </tr>
      </thead>
      <tbody>
        ${channels.map(channel => `
          <tr>
            <td><a href="https://www.youtube.com/channel/${channel.id}" target="_blank">${channel.snippet.title}</a></td>
            <td>${parseInt(channel.statistics.subscriberCount, 10).toLocaleString()}</td>
            <td>${parseInt(channel.statistics.viewCount, 10).toLocaleString()}</td>
            <td>${parseInt(channel.statistics.videoCount, 10).toLocaleString()}</td>
            <td>${new Date(channel.snippet.publishedAt).toLocaleDateString()}</td>
            <td>${Number(channel.videosLast12Months).toLocaleString()}</td>
            <td>${channel.averageVideoDuration}</td>
            <td>${channel.brandingSettings?.channel?.membershipsEnabled ? "Yes" : "No"}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// Expose functions globally
window.searchChannels = searchChannels;
window.sortResults = sortResults;
