// Arabic dictionary, keyed by the English text. Each screen area keeps its own
// file so translations stay next to the code that uses them.
import { CORE } from "./core";
import { MANAGER } from "./manager";
import { REPORTS } from "./reports";
import { TASKS } from "./tasks";
import { VENUE } from "./venue";
import { VENUES } from "./venues";

export const AR: Record<string, string> = { ...CORE, ...MANAGER, ...TASKS, ...REPORTS, ...VENUE, ...VENUES };
