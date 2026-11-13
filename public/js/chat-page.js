/* The live chat on the pages the server builds alone (a service, a project, an article, the policies…).
   They have no site script, so this small entry loads the content and starts the same chat window as the home page.
   Buttons marked data-open-chat open it (chat.js), with data-topic / data-service already chosen. */
import { load } from "./site/data.js";
import { setupChat } from "./site/chat.js";

(async () => {
  try { await load(); } catch { /* the chat keeps its defaults */ }
  setupChat();
})();
