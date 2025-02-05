const API_KEY = 'AIzaSyB8n5z6QqIuj7-dl1z_EmHDBi2X0kWRpWw'; // Replace with your actual API key 
const SEARCH_BASE_URL = 'https://www.googleapis.com/youtube/v3/search';
const CHANNELS_BASE_URL = 'https://www.googleapis.com/youtube/v3/channels';

// Global variable to store channel data and current sort orders
let channelsData = [];
let sortOrder = {
  name: 'asc',    // channel name
  subs: 'asc',    // subscriber count
  views: 'asc',   // view count
  videos: 'asc',  // video count
  launch: 'asc',  // launch date
  last12: 'asc',  // videos last 12 months
  memberships: 'asc' // memberships enabled
};

async function searchChannels() {
  // Retrieve input values from the HTML form
  const query = document.getElementById('query').value.trim();
  // Use the "region" input to filter by the channel's associated country (from snippet.country)
  const countryFilter = document.getElementById('region').value; // e.g., "US", "GB", etc.
  const minSubs = document.getElementById('minSubs').value;
  const maxSubs = document.getElementById('maxSubs').value;
  
  if (!query) {
    alert("Please enter a search query.");
    return;
  }
  
  // Build the URL for the search endpoint (searching for channels)
  let searchUrl = `${SEARCH_BASE_URL}?part=snippet&q=${encodeURIComponent(query)}&type=channel&key=${API_KEY}&maxResults=25`;
  
  try {
    // First API call: search for channels
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    
    if (!searchResponse.ok) {
      console.error("Error fetching channels:", searchData.error.message);
      return;
    }
    
    // Extract channel IDs from search results (found in snippet.channelId)
    const channelIds = searchData.items
      .map(item => item.snippet.channelId)
      .filter(id => id)
      .join(',');
    
    if (!channelIds) {
      document.getElementById("results").innerHTML =
        "<p>No channels found. Try a different query.</p>";
      return;
    }
    
    // Second API call: get detailed channel info (snippet, statistics, contentDetails, brandingSettings)
    const channelsUrl = `${CHANNELS_BASE_URL}?part=snippet,statistics,contentDetails,brandingSettings&id=${channelIds}&key=${API_KEY}`;
    const channelsResponse = await fetch(channelsUrl);
    const channelsDataJson = await channelsResponse.json();
    
    if (!channelsResponse.ok) {
      console.error("Error fetching channel details:", channelsDataJson.error.message);
      return;
    }
    
    // Start with the full list of channels from the API
    let filteredChannels = channelsDataJson.items;
    
    // Filter by channel's associated country if provided (using snippet.country)
    if (countryFilter) {
      filteredChannels = filteredChannels.filter(channel => {
        return channel.snippet.country &&
               channel.snippet.country.toUpperCase() === countryFilter.toUpperCase();
      });
    }
    
    // Filter by subscriber count if specified (remove commas before parsing)
    if (minSubs) {
      const minValue = parseInt(minSubs.replace(/,/g, ''), 10);
      filteredChannels = filteredChannels.filter(channel => {
        const subs = channel.statistics && channel.statistics.subscriberCount
          ? parseInt(channel.statistics.subscriberCount, 10)
          : 0;
        return subs >= minValue;
      });
    }
    if (maxSubs) {
      const maxValue = parseInt(maxSubs.replace(/,/g, ''), 10);
      filteredChannels = filteredChannels.filter(channel => {
        const subs = channel.statistics && channel.statistics.subscriberCount
          ? parseInt(channel.statistics.subscriberCount, 10)
          : 0;
        return subs <= maxValue;
      });
    }
    
    // For each channel, augment it with videosLast12Months
    channelsData = await Promise.all(filteredChannels.map(async channel => {
      channel.videosLast12Months = await getVideosLast12Months(channel);
      return channel;
    }));
    
    // Display the results in a table
    displayResults(channelsData);
    
  } catch (error) {
    console.error("Network error:", error);
  }
}

// Function to fetch the count of videos uploaded in the last 12 months for a given channel
async function getVideosLast12Months(channel) {
  let count = 0;
  if (!channel.contentDetails ||
      !channel.contentDetails.relatedPlaylists ||
      !channel.contentDetails.relatedPlaylists.uploads) {
    return count;
  }
  const playlistId = channel.contentDetails.relatedPlaylists.uploads;
  let nextPageToken = "";
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  
  do {
    let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${API_KEY}`;
    if (nextPageToken) {
      url += `&pageToken=${nextPageToken}`;
    }
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

function displayResults(channels) {
  const resultsContainer = document.getElementById("results");
  resultsContainer.innerHTML = ""; // Clear previous results
  
  if (!channels || channels.length === 0) {
    resultsContainer.innerHTML = "<p>No channels found matching your criteria.</p>";
    return;
  }
  
  // Create the table element
  const table = document.createElement("table");
  
  // Create table header row with clickable headers for sorting
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  
  // Define headers for the columns we want to display:
  // Channel Name, Subscribers, Views, Video Count, Launch Date, Videos Last 12 Months, Memberships Enabled
  const headers = [
    { key: "name", label: "Channel Name" },
    { key: "subs", label: "Subscribers" },
    { key: "views", label: "Views" },
    { key: "videos", label: "Video Count" },
    { key: "launch", label: "Launch Date" },
    { key: "last12", label: "Videos Last 12 Months" },
    { key: "memberships", label: "Memberships Enabled" }
  ];
  
  headers.forEach(headerInfo => {
    const th = document.createElement("th");
    th.textContent = headerInfo.label;
    th.addEventListener("click", () => sortResults(headerInfo.key));
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Create table body
  const tbody = document.createElement("tbody");
  
  channels.forEach(channel => {
    const row = document.createElement("tr");
    
    // Channel Name cell with clickable link
    const nameCell = document.createElement("td");
    nameCell.innerHTML = `<a href="https://www.youtube.com/channel/${channel.id}" target="_blank">
                            ${channel.snippet.title}
                          </a>`;
    
    // Subscribers cell (formatted with commas)
    const subsCell = document.createElement("td");
    subsCell.textContent = parseInt(channel.statistics.subscriberCount, 10).toLocaleString();
    
    // Views cell (formatted with commas)
    const viewsCell = document.createElement("td");
    viewsCell.textContent = parseInt(channel.statistics.viewCount, 10).toLocaleString();
    
    // Video Count cell (overall, from statistics.videoCount)
    const videosCell = document.createElement("td");
    videosCell.textContent = parseInt(channel.statistics.videoCount, 10).toLocaleString();
    
    // Launch Date cell (formatted as local date)
    const launchCell = document.createElement("td");
    const launchDate = new Date(channel.snippet.publishedAt);
    launchCell.textContent = launchDate.toLocaleDateString();
    
    // Videos Last 12 Months cell (formatted with commas)
    const last12Cell = document.createElement("td");
    last12Cell.textContent = channel.videosLast12Months !== undefined
      ? Number(channel.videosLast12Months).toLocaleString()
      : "0";
    
    // Memberships Enabled cell (derived from brandingSettings)
    const membershipCell = document.createElement("td");
    let membershipsEnabled = "N/A";
    if (channel.brandingSettings && channel.brandingSettings.channel) {
      membershipsEnabled = channel.brandingSettings.channel.membershipsEnabled ? "Yes" : "No";
    }
    membershipCell.textContent = membershipsEnabled;
    
    row.appendChild(nameCell);
    row.appendChild(subsCell);
    row.appendChild(viewsCell);
    row.appendChild(videosCell);
    row.appendChild(launchCell);
    row.appendChild(last12Cell);
    row.appendChild(membershipCell);
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  resultsContainer.appendChild(table);
}

function sortResults(field) {
  if (field === "name") {
    sortOrder.name = sortOrder.name === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const nameA = a.snippet.title.toLowerCase();
      const nameB = b.snippet.title.toLowerCase();
      return sortOrder.name === "asc"
        ? (nameA < nameB ? -1 : nameA > nameB ? 1 : 0)
        : (nameA > nameB ? -1 : nameA < nameB ? 1 : 0);
    });
  } else if (field === "subs") {
    sortOrder.subs = sortOrder.subs === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const subsA = parseInt(a.statistics.subscriberCount, 10);
      const subsB = parseInt(b.statistics.subscriberCount, 10);
      return sortOrder.subs === "asc" ? subsA - subsB : subsB - subsA;
    });
  } else if (field === "views") {
    sortOrder.views = sortOrder.views === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const viewsA = parseInt(a.statistics.viewCount, 10);
      const viewsB = parseInt(b.statistics.viewCount, 10);
      return sortOrder.views === "asc" ? viewsA - viewsB : viewsB - viewsA;
    });
  } else if (field === "videos") {
    sortOrder.videos = sortOrder.videos === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const videosA = parseInt(a.statistics.videoCount, 10);
      const videosB = parseInt(b.statistics.videoCount, 10);
      return sortOrder.videos === "asc" ? videosA - videosB : videosB - videosA;
    });
  } else if (field === "launch") {
    sortOrder.launch = sortOrder.launch === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const dateA = new Date(a.snippet.publishedAt);
      const dateB = new Date(b.snippet.publishedAt);
      return sortOrder.launch === "asc" ? dateA - dateB : dateB - dateA;
    });
  } else if (field === "last12") {
    sortOrder.last12 = sortOrder.last12 === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const countA = Number(a.videosLast12Months) || 0;
      const countB = Number(b.videosLast12Months) || 0;
      return sortOrder.last12 === "asc" ? countA - countB : countB - countA;
    });
  } else if (field === "memberships") {
    sortOrder.memberships = sortOrder.memberships === "asc" ? "desc" : "asc";
    channelsData.sort((a, b) => {
      const memA = (a.brandingSettings && a.brandingSettings.channel && a.brandingSettings.channel.membershipsEnabled) ? "Yes" : "No";
      const memB = (b.brandingSettings && b.brandingSettings.channel && b.brandingSettings.channel.membershipsEnabled) ? "Yes" : "No";
      if (memA < memB) return sortOrder.memberships === "asc" ? -1 : 1;
      if (memA > memB) return sortOrder.memberships === "asc" ? 1 : -1;
      return 0;
    });
  }
  
  displayResults(channelsData);
}

// Expose the searchChannels function to the global scope so it can be called from your HTML
window.searchChannels = searchChannels;
