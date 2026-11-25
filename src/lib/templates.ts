// Task templates offered when assigning work. They are suggestions only.

export interface TaskTemplate {
  title: string;
  description: string;
  est: number; // minutes
  category: string;
}

const t = (title: string, description: string, est: number, category: string): TaskTemplate => ({
  title,
  description,
  est,
  category,
});

export const TEMPLATES: Record<string, TaskTemplate[]> = {
  ops: [
    t("Complete venue opening inspection", "Walk every zone before doors open and note anything that is not guest-ready.", 40, "Opening"),
    t("Verify all activity zones are ready", "Confirm each zone is clean, staffed and safe before the first guests arrive.", 30, "Readiness"),
    t("Check daily staff allocation", "Compare today's roster against bookings and cover any gaps.", 20, "Staffing"),
    t("Inspect customer areas", "Check seating, walkways and restrooms for cleanliness and hazards.", 25, "Inspection"),
    t("Complete venue closing checklist", "Close zones, switch off equipment and hand over to security.", 45, "Closing"),
    t("Brief the floor team on today's schedule", "Run a short briefing covering events, bookings and VIP visits.", 15, "Staffing"),
    t("Check entrance and reception desk", "Make sure the entrance is clear, signage is on and the desk is stocked.", 20, "Readiness"),
    t("Walk the parking and drop-off area", "Check lighting, signage and traffic flow at the drop-off point.", 20, "Inspection"),
    t("Inspect venue lighting", "Walk the venue and log every lamp or fixture that needs attention.", 30, "Electrical"),
    t("Check air-conditioning units", "Check filters, temperature and noise on each indoor unit.", 40, "HVAC"),
    t("Resolve reported maintenance issues", "Work through today's reported issues in order of urgency.", 60, "Repairs"),
    t("Verify equipment safety", "Inspect play structures and inflatables for wear, anchors and fixings.", 45, "Safety"),
    t("Complete end-of-day maintenance checks", "Check pumps, panels and generators before closing.", 30, "Closing"),
    t("Test generator and backup power", "Run the generator test and record the fuel level.", 25, "Electrical"),
    t("Fix loose fixtures in play zones", "Tighten or replace loose bolts, nets and padding in the play zones.", 35, "Repairs"),
    t("Check water pumps and restroom plumbing", "Check pressure, leaks and drainage across all restrooms.", 30, "Plumbing"),
  ],
  restaurant: [
    t("Set tables for the next service", "Lay covers, glassware and menus on every table in your section.", 25, "Service"),
    t("Polish cutlery and glassware", "Polish and restock cutlery and glasses for your station.", 20, "Readiness"),
    t("Restock the service station", "Refill napkins, condiments, straws and takeaway boxes.", 15, "Readiness"),
    t("Clear and reset tables after service", "Clear, wipe and reset every table in your section.", 20, "Service"),
    t("Check reservations and prepare tables", "Match tables to today's reservations and mark them reserved.", 15, "Service"),
    t("Serve the birthday party tables", "Serve food and drinks to the birthday tables and keep them cleared.", 45, "Events"),
    t("Complete restaurant opening checklist", "Open the floor, check stations and confirm the kitchen is ready.", 35, "Opening"),
    t("Inspect dining area", "Check tables, chairs, menus and floors for cleanliness.", 20, "Inspection"),
    t("Check hygiene standards", "Run the hygiene checklist for prep areas, fridges and hand-wash points.", 30, "Hygiene"),
    t("Prepare for peak service hours", "Brief the team, pre-set tables and check reservations before the rush.", 30, "Service"),
    t("Check kids' menu stock", "Confirm stock for every kids' menu item and flag shortages.", 15, "Stock"),
  ],
  christian: [
    t("Open the gates and check the cameras", "Unlock the entrances, test every camera and the recording screen.", 20, "Security"),
    t("Patrol the venue", "Walk every zone, the parking and the back doors; report anything unusual.", 30, "Security"),
    t("Check fire extinguishers and exits", "Make sure extinguishers are in place and every emergency exit is clear.", 25, "Safety"),
    t("Manage the entrance at peak time", "Stay at the main entrance during the rush and keep the queue moving.", 60, "Security"),
    t("Lock up and set the alarm", "Check every zone is empty, lock all doors and set the alarm.", 25, "Closing"),
  ],
  playground: [
    t("Open and inspect the play areas", "Walk every play zone before doors open: nets, padding, slides and soft floor.", 30, "Opening"),
    t("Check trampolines and inflatables", "Inspect springs, nets, anchors and air pressure before the first session.", 25, "Safety"),
    t("Clean and sanitise soft play", "Wipe and sanitise mats, balls and climbing frames in the soft-play zone.", 40, "Hygiene"),
    t("Open the entry desk", "Count the cash float, test the card machine and set out wristbands.", 15, "Entry desk"),
    t("Supervise the toddler zone", "Stay with the toddler zone for the session and keep the gate closed.", 60, "Supervision"),
    t("Run the kids' activity session", "Lead the scheduled games or craft session for walk-in kids.", 45, "Activities"),
    t("Prepare the party room", "Set tables, decorations and goody bags for the next birthday party.", 40, "Parties"),
    t("Reset the play areas after the rush", "Collect toys, tidy ball pits and check for anything broken.", 25, "Reset"),
    t("Restock socks, wristbands and first aid", "Refill grip socks, wristbands and the first-aid kit at the desk.", 15, "Entry desk"),
    t("Close the playground", "Clear every zone, switch off inflatables and hand the cash to the manager.", 30, "Closing"),
  ],
};

export const MANAGER_TEMPLATES: TaskTemplate[] = [
  t("Review team workload and rebalance the queue", "Check each team member's queue and move tasks where someone is overloaded.", 20, "Management"),
  t("Approve next week's roster", "Review the draft roster against bookings and approve or adjust it.", 25, "Management"),
  t("Review open follow-ups with the Operations Manager", "Go through open follow-ups and agree owners and deadlines.", 20, "Management"),
  t("Check department readiness for the weekend", "Confirm staffing, stock and equipment for the weekend peak.", 30, "Management"),
];
