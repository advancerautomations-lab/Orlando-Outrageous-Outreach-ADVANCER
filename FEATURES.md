# Lead Management System — Feature Guide

A complete breakdown of every page and what you can do on it.

---

## Dashboard

Your command center — see everything at a glance.

- **4 key metrics** at the top: Total Leads, Active Leads, Response Rate, and Conversion Rate
- **Today's Activity Feed** — real-time log of everything that happened in the last 24 hours (emails sent, opened, clicked, replied, new leads created, meetings scheduled) with summary chips showing counts
- **Pipeline Funnel** — visual breakdown of leads across 5 stages (New, Contacted, Qualified, Proposal, Won) with progress bars showing how many leads sit at each stage
- **30-Day Outreach Chart** — area chart showing email performance over the last month with toggleable metrics (Sent, Opened, Clicked, Replied)
- **Lead Sources Donut Chart** — shows where your leads come from (Cold Outreach, Form Submission, Inbound Email, Manual, Referral) with color-coded breakdown
- **Hot Prospects Table** — top 10 most engaged prospects who haven't converted yet, sorted by engagement level, showing their email stage progress as visual dots

---

## Leads Pipeline

Where you manage every lead from first contact to close.

- **Search** leads by name, company, or email in real-time
- **Filter** by status: All, New, Contacted, Qualified, Proposal, Won, Lost
- **Pipeline progress bar** at the top showing distribution across all statuses
- **Stats row** showing Total Leads, Active Deals, and Won count
- **Create new leads** with a form (name, email, phone, company, estimated value, source)
- **Export leads as CSV** for reporting or external use
- **Toggle between List and Grid view**

### Lead Detail Panel (click any lead)
- View and edit all lead info: name, email, phone, company, status, source, LinkedIn URL
- **Inline editable Est. Value** with dollar prefix — type a number and it auto-saves
- **Assign leads to team members** via dropdown
- **Change lead status** through a dropdown or the right-click menu
- **Deep Research** — AI-powered button that compares your LinkedIn profile with the lead's to find common ground and talking points (requires both LinkedIn URLs set)
- **Notes section** — free-text notes that auto-save when you click away
- **Recent Activity Timeline** — last 10 messages exchanged with this lead
- **Outreach History** — if the lead came from a prospect, shows their email engagement (last opened, last sent, email stage progress)
- **Send Message** button — jumps to the Communication tab with this lead selected
- **Delete leads** with confirmation dialog (requires delete permission)

---

## Communication

Your email inbox built into the CRM.

- **Send and receive emails** directly through Gmail — no need to switch apps
- **Real-time notifications** — new inbound emails appear instantly via Supabase Realtime
- **Email threading** — conversations grouped by Gmail thread ID so you see the full history
- **View other team members' conversations** with the same lead — get context on what was discussed before you jump in
- **Compose emails** with subject line, message body, and file attachments
- **Read/unread tracking** — see which messages have been read

### Pending Emails Tab
- **Google Gemini AI integration** watches your inbox and classifies inbound emails:
  - **Likely Lead** — high confidence this is a real person interested in your service
  - **Needs Review** — AI is unsure, you decide
  - **Auto Dismissed** — likely spam, newsletter, or automated email
- **AI confidence score** shown for each classification
- **Convert pending emails to leads** — one click to create a new lead from the email
- **Link to existing lead** — attach the email to a lead already in your system
- **Delete/archive** emails you don't need

---

## Calendar

Schedule meetings and see who needs attention.

- **Monthly calendar grid** showing events and lead avatars on each day
- **Click any day** to open a detailed hourly timeline (7am–10pm)
- **Create meetings** by clicking any empty hour slot or using the Schedule button
- **Google Calendar sync** — events created here appear in your Google Calendar and vice versa
- **Google Meet links** auto-generated for every meeting
- **Send calendar invites** — attendees get an email invitation automatically
- **Edit or delete events** with attendee notification
- **Duration presets** — quick buttons for 15, 30, 45, or 60 minute meetings
- **Link meetings to leads** — select which lead the meeting is about

### Hot Leads Sidebar
- **Top 5 most active leads** ranked by message count and recency
- Shows message count badge and recent activity (last 7 days highlighted in orange)
- **Quick Schedule button** — hover over any hot lead to instantly schedule a meeting with them

### Upcoming Panel
- Shows your next scheduled meetings at a glance
- Displays date, title, and time for each upcoming event

---

## Analytics

Track your outreach performance and prospect pipeline.

### Cold Prospects Tab
- View all prospects in your cold outreach pipeline (requires Prospects permission)
- See engagement metrics: who opened, clicked, or replied to your emails
- Track prospect-to-lead conversion funnel

### Outreach Stage Tab
- Email campaign performance broken down by stage
- Select specific campaigns from a dropdown
- Metrics per campaign: total sent, opened, clicked, replied
- Response rates and conversion percentages

### Interaction Activity Tab
- Overall email engagement patterns over time
- Performance trends and activity heatmaps

---

## Settings

Manage your account and preferences.

### Profile
- Edit your **full name**
- View your **email** (read-only, set during signup)
- Add or update your **LinkedIn Profile URL** — needed for Deep Research to work

### Security
- **Change your password** with real-time validation:
  - Must be at least 8 characters
  - Confirmation must match
- Show/hide password toggle

### Connected Accounts
- **Gmail & Calendar** connection status
- Shows which Google email is connected
- Connect or disconnect Gmail OAuth with one click

### Appearance
- **Dark Mode toggle** — switches the entire app to dark theme
- Preference saved to localStorage, persists across sessions

---

## Team Management

Admin-only page to manage your sales team.

- **View all team members** with their roles and permissions
- **Invite new team members** — enter their name, email, and role (Admin or Sales Rep). They receive a password reset email to set up their account
- **Role badges** — Crown icon for Admin, Shield for Sales Rep
- **Toggle individual permissions** per team member:
  - **Analytics** — can view reports and charts
  - **Prospects** — can access the cold prospects pipeline
  - **Delete Leads** — can permanently remove leads
- **Per-toggle loading spinner** — shows a spinner on the specific permission being updated so you know it's saving
- Your own card shown at the top with all permissions visible

---

## Setup Wizard

First-time onboarding flow (shown once after signup).

1. **Welcome** — personalized greeting with preview of what's next
2. **Set Password** — create a secure password (replaces the temporary one)
3. **Connect Gmail & Calendar** — Google OAuth to enable email and calendar features (can skip)
4. **LinkedIn Profile** — add your LinkedIn URL for Deep Research (can skip)
5. **Done** — summary of what was set up, with a button to enter the workspace

---

## Global Features (Always Active)

### Real-Time Notifications
- **Bell icon** in the header shows unread count (red badge, caps at 9+)
- Click to see up to 50 recent notifications:
  - New inbound message (blue Mail icon)
  - New pending email (amber Inbox icon)
  - Lead stage change (green TrendingUp icon)
- **Mark all as read** button
- Click any notification to navigate to the relevant page

### Realtime Data Sync
- **Messages** — new emails appear instantly without refreshing
- **Leads** — status changes and new leads sync across all team members in real-time
- **Pending Emails** — new inbound emails classified by AI appear immediately

### Celebrations
- **Confetti animation** fires when a prospect converts to a lead
- Toast notification congratulating the conversion

### Lead Assignment
- Any lead can be assigned to a specific team member
- Assigned member's initials shown on the lead card in the list
- Assignment visible across all views
