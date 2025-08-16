import { io } from "socket.io-client"
import Bowser from "bowser";
const api = typeof (globalThis as any).browser !== 'undefined' ? (globalThis as any).browser : chrome;

const browserName = Bowser.getParser(navigator.userAgent).getBrowserName();

const randomLetters = (length:number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const browserDiff = browserName || randomLetters(6);


async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
    
  console.log("Tabs query result:", tabs); // Debug log
  
  if (!tabs || tabs.length === 0) {
    console.log("No tabs found or tabs permission missing");
    return null;
  }
  
  return tabs[0];
}

const socket = io("http://localhost:7323", {
   transports: ['websocket']
})

socket.on("connect", () => {
  console.log("Connected to the server, browser:", browserName);
  //socket.emit("getVideoTranscript", {videoId: "JNljnRcu_hE"})
});

socket.on("getVideoId", async(data) => {
  const activeTab = await getActiveTab();
  const url = new URL(activeTab.url);
  if ((url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") || !url.searchParams.get("v")) {
    return socket.emit("getVideoId", {"status": "ERROR", error: "Not a YouTube Video!"})
  }
  return socket.emit("getVideoId", {"status": "OK", videoId: url.searchParams.get("v"), title: activeTab.title });
});

async function getAllTabs() {
   try {
    const tabs = await api.tabs.query({});
    const realTabs = tabs.map(tab =>({
      id: browserDiff + tab.id,
      name: tab.title || "Unknown Tab",
      url: tab.url || "Unknown URL",
      favicon: tab.favIconUrl || "",
      type: browserName,
      unavailable: tab.frozen || tab.discarded
    }))
    console.log("All tabs retrieved:", realTabs);
    socket.emit("getAllTabs", { status: "OK", tabs: realTabs });
  } catch (error) {
    console.error("Error retrieving tabs:", error);
    socket.emit("getAllTabs", { status: "ERROR", error: error instanceof Error ? error.message : "Unknown error" });
  }
}

socket.on("getAllTabs", async () => await getAllTabs());

// api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
//   if (changeInfo.status === "complete") {
//     console.log("Tab fully loaded, fetching all tabs again");
//     await getAllTabs();
//   }
// });

socket.on("getPageContent", async (data) => {
  console.log("Background received request for page content:", data);
  
  try {    
    // Get all the tabs
    const tabs = await api.tabs.query({});
    
    console.log("Tabs query result:", tabs); // Debug log
    
    if (!tabs || tabs.length === 0) {
      console.log("No tabs found or tabs permission missing");
      socket.emit("getPageContent", { 
        status: "ERROR",
        error: "No tabs found or missing tabs permission" 
      });
      return;
    }

    // Get target tab IDs from data.pages or fall back to active tab
    let targetTabIds = [];
    
    if (data.pages && Array.isArray(data.pages) && data.pages.length > 0) {
      // Filter tabs that match the provided IDs
      console.log("Browser diff:", browserDiff);
      console.log("Data pages:", data.pages);
      targetTabIds = data.pages.filter(page => {
        console.log("Checking page ID:", page.id);
        return tabs.find(tab => browserDiff + tab.id == page.id)
      }).map(page => page.id);
      console.log("Target tab IDs from data.pages:", targetTabIds);
    } else {
      // Fall back to active tab if no specific pages requested
      const activeTab = tabs.find(tab => tab.active);
      if (activeTab?.id) {
        targetTabIds = [browserDiff + activeTab.id]; // Use prefixed ID for consistency
        console.log("Using active tab as fallback:", browserDiff + activeTab.id);
      }
    }
    
    if (targetTabIds.length === 0) {
      console.error("No valid tab IDs found");
      socket.emit("getPageContent", { 
        status: "ERROR",
        error: "No valid tab IDs found" 
      });
      return;
    }
    
    // Send messages to all target tabs simultaneously
    const contentPromises = targetTabIds.map(tabId => {
      return new Promise((resolve) => {
        const tab = tabs.find(t => browserDiff + t.id === tabId);
        const exresponse = {
          id: tabId,
          name: tab?.title || "Unknown Tab",
          url: tab?.url || "Unknown URL",
          favicon: tab?.favIconUrl || "",
          type: browserName
        }
        console.log(exresponse)
        console.log("Sending message to tab:", tabId.replace(browserDiff, ""), Number(tabId.replace(browserDiff, "")));
        api.tabs.sendMessage(
          Number(tabId.replace(browserDiff, "")),
          { action: "getPageContent", data },
          (response) => {
            const lastError = api.runtime.lastError;
            if (lastError) {
              console.error(`Error communicating with tab ${tabId}:`, lastError);
              resolve({
                ...exresponse,
                success: false,
                error: lastError.message
              });
              return;
            }
            
            if (response?.success) {
              console.log(`Page content retrieved from tab ${tabId}`);
              resolve({
                ...exresponse,
                success: true,
                content: response.data,
              });
            } else {
              console.error(`Content script error in tab ${tabId}:`, response?.error);
              resolve({
                ...exresponse,
                success: false,
                error: response?.error || "Unknown error from content script"
              });
            }
          }
        );
      });
    });
    
    // Wait for all content retrieval operations to complete
    const results = await Promise.all(contentPromises);

    // Separate successful and failed results
    const successful = results.filter((result: any) => result.success);
    const failed = results.filter((result: any) => !result.success);
    
    console.log(`Content retrieval complete: ${successful.length} successful, ${failed.length} failed`);
    
    // Send response with all results
    socket.emit("getPageContent", {
      status: successful.length > 0 ? "OK" : "ERROR",
      results: results
    });
    
  } catch (error) {
    console.error("Error in background script:", error);
    socket.emit("getPageContent", { 
      status: "ERROR",
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
})

socket.on("connect_error", (err) => console.error("❌ Connect error:", err))
socket.on("disconnect", () => console.warn("⚠️ Disconnected"))

export {}
