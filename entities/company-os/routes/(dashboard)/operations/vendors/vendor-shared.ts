// Shared between the list page (server), shelf and forms (client).

export const VENDOR_TYPES = ["car", "tour", "travel_agency", "conference_room", "other"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

// Stored as the display string; "" / null = unrated.
export const VENDOR_RATINGS = ["Preferred", "Average", "Poor Experience", "To Consider"] as const;

export type VendorRow = {
  id: string;
  type: string;
  name: string;
  price_range: string | null;
  address: string | null;
  phone: string | null;
  tax_id: string | null;
  bank_info: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  secondary_contact_name: string | null;
  secondary_contact_email: string | null;
  secondary_contact_phone: string | null;
  rating: string | null;
  url: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
};

export const VENDOR_SELECT =
  "id, type, name, price_range, address, phone, tax_id, bank_info, " +
  "primary_contact_name, primary_contact_email, primary_contact_phone, " +
  "secondary_contact_name, secondary_contact_email, secondary_contact_phone, " +
  "rating, url, notes, archived_at, created_at";
