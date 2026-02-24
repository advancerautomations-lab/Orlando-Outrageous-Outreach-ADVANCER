import { Lead, LeadStatus, Meeting, Activity, Message } from './types';

export const MOCK_LEADS: Lead[] = [
  {
    id: '1',
    first_name: 'Emma',
    last_name: 'Richardson',
    company: 'Acme Corp',
    email: 'emma@acmecorp.com',
    phone: '+61 400 123 456',
    value: 5000,
    status: LeadStatus.NEW,
    source: 'Instagram',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    avatar_url: 'https://picsum.photos/200/200?random=1',
    notes: 'Interested in the premium butterfly weft collection.'
  },
  {
    id: '2',
    first_name: 'Liam',
    last_name: 'Chen',
    company: 'Aura Salon',
    email: 'liam@aurasalon.com.au',
    value: 12500,
    status: LeadStatus.QUALIFIED,
    source: 'Referral',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    avatar_url: 'https://picsum.photos/200/200?random=2',
    notes: 'Needs bulk order for new branch opening.'
  },
  {
    id: '3',
    first_name: 'Sophia',
    last_name: 'Miller',
    company: 'Studio 54',
    email: 'sophia@studio54.com',
    value: 3200,
    status: LeadStatus.CONTACTED,
    source: 'Website',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    avatar_url: 'https://picsum.photos/200/200?random=3'
  },
  {
    id: '4',
    first_name: 'Noah',
    last_name: 'Wilson',
    company: 'Wilson Cuts',
    email: 'noah@wilsoncuts.com',
    value: 8900,
    status: LeadStatus.PROPOSAL,
    source: 'Cold Email',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    avatar_url: 'https://picsum.photos/200/200?random=4'
  },
  {
    id: '5',
    first_name: 'Olivia',
    last_name: 'Taylor',
    company: 'Pure Beauty',
    email: 'olivia@purebeauty.com',
    value: 15000,
    status: LeadStatus.WON,
    source: 'Trade Show',
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    avatar_url: 'https://picsum.photos/200/200?random=5'
  }
];

export const MOCK_MEETINGS: Meeting[] = [
  {
    id: '101',
    title: 'Initial Consultation - Acme Corp',
    lead_id: '1',
    start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
    description: 'Discuss volume requirements and color matching kit.'
  },
  {
    id: '102',
    title: 'Contract Review - Wilson Cuts',
    lead_id: '4',
    start_time: new Date(Date.now() + 86400000 * 2).toISOString(), // Day after tomorrow
    end_time: new Date(Date.now() + 86400000 * 2 + 1800000).toISOString(),
    description: 'Finalize pricing for quarterly shipments.'
  }
];

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: 'a1',
    lead_id: '1',
    type: 'email',
    content: 'Sent introductory brochure and pricing list.',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'a2',
    lead_id: '2',
    type: 'call',
    content: 'Spoke with Liam. He is very interested in the Nano beads.',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'm1',
    lead_id: '1',
    direction: 'outbound',
    subject: 'Welcome',
    content: 'Hi Emma,\n\nThanks for your interest in our premium butterfly weft collection. I wanted to reach out and see if you had any specific questions regarding the textures we offer?\n\nBest,\nAlex',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    is_read: true
  },
  {
    id: 'm2',
    lead_id: '1',
    direction: 'inbound',
    subject: 'Re: Welcome',
    content: 'Hi Alex,\n\nYes actually! Do you have a colour ring I could purchase beforehand? I want to make sure the shades match my current stock.\n\nThanks,\nEmma',
    timestamp: new Date(Date.now() - 86400000 * 1.8).toISOString(),
    is_read: true
  },
  {
    id: 'm3',
    lead_id: '1',
    direction: 'outbound',
    subject: 'Re: Welcome',
    content: 'Absolutely Emma, I can send one out today. It should arrive by Thursday.',
    timestamp: new Date(Date.now() - 86400000 * 1.5).toISOString(),
    is_read: true
  },
  {
    id: 'm4',
    lead_id: '2',
    direction: 'outbound',
    subject: 'Bulk Order Inquiry',
    content: 'Hi Liam,\n\nFollowing up on our call yesterday regarding the bulk order for the new branch. Have you had a chance to review the quote?',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    is_read: true
  },
  {
    id: 'm5',
    lead_id: '2',
    direction: 'inbound',
    subject: 'Re: Bulk Order Inquiry',
    content: 'Hey Alex, yes looks good. Just waiting for final sign off from my partner. Will get back to you EOD.',
    timestamp: new Date(Date.now() - 86400000 * 0.5).toISOString(),
    is_read: false
  }
];