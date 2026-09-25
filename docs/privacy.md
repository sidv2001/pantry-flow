# Privacy in the first slice

The starter stores its state under the `pantry-flow-v1` key in this browser's `localStorage`: ingredient names, measured amounts, units and locations; optional printed-label and CHECK dates; the confirmed recipe ID, swap choice, freezer-match flag and confirmation time; and shopping-list entries and checkmarks. The page works without an account, backend, analytics SDK, external product API, photo upload or microphone access.

The app does not send that pantry state over the network. Loading the site still requests static files from its host; clicking an external FDA link opens that site, which has its own practices. Installing developer dependencies through npm is separate from app runtime. Browser storage is plain local data accessible to scripts on the same origin and to people or extensions with access to that browser profile; it is not encrypted or synced by PantryFlow. Private browsing or browser cleanup may erase it.

Use **Clear this browser's data** in the footer to remove the key after a confirmation prompt. An unreadable saved record is left untouched; the app shows an explicit clear-and-start-again choice rather than silently replacing it. Shopping and inventory edits are saved immediately when storage permits, and a visible error appears if saving fails. There is no export or cross-device sync yet.

Receipt/photo recognition, voice, outside product lookup and proactive prompts belong to the [roadmap](roadmap.md). Each would need a separate permission and data-flow review; none is silently active here.
