const API_KEY = 'AIzaSyB8n5z6QqIuj7-dl1z_EmHDBi2X0kWRpWw'; // Replace with your actual API key
const SEARCH_BASE_URL = 'https://www.googleapis.com/youtube/v3/search';
const CHANNELS_BASE_URL = 'https://www.googleapis.com/youtube/v3/channels';
const CATEGORIES_BASE_URL = 'https://www.googleapis.com/youtube/v3/videoCategories';

// Global variable to store channel data and current sort orders
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
    const categoryFilter = document.getElementById('category').value; // Selected category ID
    const minSubs = document.getElementById('minSubs').value;
    const maxSubs = document.getElementById('maxSubs').value;

    // Ensure at least one filter is selected
    if (!query && !countryFilter && !categoryFilter && !minSubs && !maxSubs) {
        alert("Please select at least one filter or enter a search term.");
        return;
    }

    let channelIds = [];

    // ✅ 1️⃣ If Category is selected (and no query), search for videos to extract channel IDs
    if (!query && categoryFilter) {
        let videoSearchUrl = `${SEARCH_BASE_URL}?part=snippet&type=video&videoCategoryId=${categoryFilter}&key=${API_KEY}&maxResults=25`;

        try {
            const videoResponse = await fetch(videoSearchUrl);
            const videoData = await videoResponse.json();

            if (!videoResponse.ok || !videoData.items) {
                console.error("Error fetching videos:", videoData.error?.message);
                return;
            }

            // Extract unique channel IDs from videos
            channelIds = [...new Set(videoData.items.map(video => video.snippet.channelId))];
        } catch (error) {
            console.error("Network error:", error);
            return;
        }
    }

    // ✅ 2️⃣ If a keyword is present, use the normal search API to find channels
    if (query) {
        let searchUrl = `${SEARCH_BASE_URL}?part=snippet&type=channel&q=${encodeURIComponent(query)}&key=${API_KEY}&maxResults=25`;

        try {
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (!searchResponse.ok || !searchData.items) {
                console.error("Error fetching channels:", searchData.error?.message);
                return;
            }

            // Merge channel IDs (avoid duplicates)
            const queryChannelIds = searchData.items.map(item => item.snippet.channelId).filter(id => id);
            channelIds = [...new Set([...channelIds, ...queryChannelIds])];
        } catch (error) {
            console.error("Network error:", error);
            return;
        }
    }

    // ✅ 3️⃣ If no channels were found, show a message
    if (channelIds.length === 0) {
        document.getElementById("results").innerHTML = "<p>No channels found. Try a different filter.</p>";
        return;
    }

    // ✅ 4️⃣ Fetch Channel Details
    try {
        let channelsUrl = `${CHANNELS_BASE_URL}?part=snippet,statistics,contentDetails,brandingSettings&id=${channelIds.join(",")}&key=${API_KEY}`;
        const channelsResponse = await fetch(channelsUrl);
        const channelsDataJson = await channelsResponse.json();

        if (!channelsResponse.ok) {
            console.error("Error fetching channel details:", channelsDataJson.error.message);
            return;
        }

        let filteredChannels = channelsDataJson.items;

        // ✅ 5️⃣ Apply Additional Filters (Country, Subscribers)
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

        channelsData = filteredChannels;
        displayResults(channelsData);
    } catch (error) {
        console.error("Network error:", error);
    }
}

// Function to display search results in a table
function displayResults(channels) {
  const resultsContainer = document.getElementById("results");
  resultsContainer.innerHTML = ""; // Clear previous results

  if (!channels || channels.length === 0) {
    resultsContainer.innerHTML = "<p>No channels found matching your criteria.</p>";
    return;
  }

  // Create the table element
  const table = document.createElement("table");

  // Create table header row
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Define headers for the columns
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
    th.addEventListener("click", () => sortResults(headerInfo.key)); // Sort when clicking headers
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create table body
  const tbody = document.createElement("tbody");

  channels.forEach(channel => {
    const row = document.createElement("tr");

    // Channel Name with clickable link
    const nameCell = document.createElement("td");
    nameCell.innerHTML = `<a href="https://www.youtube.com/channel/${channel.id}" target="_blank">
                            ${channel.snippet.title}
                          </a>`;

    // Subscribers
    const subsCell = document.createElement("td");
    subsCell.textContent = parseInt(channel.statistics.subscriberCount, 10).toLocaleString();

    // Views
    const viewsCell = document.createElement("td");
    viewsCell.textContent = parseInt(channel.statistics.viewCount, 10).toLocaleString();

    // Video Count
    const videosCell = document.createElement("td");
    videosCell.textContent = parseInt(channel.statistics.videoCount, 10).toLocaleString();

    // Launch Date
    const launchCell = document.createElement("td");
    const launchDate = new Date(channel.snippet.publishedAt);
    launchCell.textContent = launchDate.toLocaleDateString();

    // Videos Last 12 Months
    const last12Cell = document.createElement("td");
    last12Cell.textContent = channel.videosLast12Months !== undefined
        ? Number(channel.videosLast12Months).toLocaleString()
        : "0";

    // Memberships Enabled
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
// 🔹 ADD SORT FUNCTION BELOW THIS LINE

function sortResults(field) {
 if (!channelsData || channelsData.length === 0) return;

 // Toggle sorting order
    sortOrder[field] = sortOrder[field] === "asc" ? "desc" : "asc";

    channelsData.sort((a, b) => {
        let valueA, valueB;

        switch (field) {
            case "name":
                valueA = a.snippet.title.toLowerCase();
                valueB = b.snippet.title.toLowerCase();
                return sortOrder[field] === "asc" ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);

            case "subs":
                valueA = parseInt(a.statistics.subscriberCount, 10) || 0;
                valueB = parseInt(b.statistics.subscriberCount, 10) || 0;
                break;

            case "views":
                valueA = parseInt(a.statistics.viewCount, 10) || 0;
                valueB = parseInt(b.statistics.viewCount, 10) || 0;
                break;

            case "videos":
                valueA = parseInt(a.statistics.videoCount, 10) || 0;
                valueB = parseInt(b.statistics.videoCount, 10) || 0;
                break;

            case "launch":
                valueA = new Date(a.snippet.publishedAt);
                valueB = new Date(b.snippet.publishedAt);
                return sortOrder[field] === "asc" ? valueA - valueB : valueB - valueA;

            case "last12":
                valueA = parseInt(a.videosLast12Months, 10) || 0;
                valueB = parseInt(b.videosLast12Months, 10) || 0;
                break;

            case "memberships":
                valueA = a.brandingSettings?.channel?.membershipsEnabled ? 1 : 0;
                valueB = b.brandingSettings?.channel?.membershipsEnabled ? 1 : 0;
                break;

            default:
                return 0;
        }

        return sortOrder[field] === "asc" ? valueA - valueB : valueB - valueA;
    });

    // Refresh the table after sorting
    displayResults(channelsData);
}

// Expose the searchChannels function globally
window.sortResults = sortResults;
window.searchChannels = searchChannels;
