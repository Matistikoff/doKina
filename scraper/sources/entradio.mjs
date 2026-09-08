import { fetchWithRetry } from "../utils.mjs";

// The public ticket shop uses an anonymous guest session, not an API key.
// Its API remains reachable when the cinema's Next.js site serves a Vercel challenge.
const ENDPOINT = "https://shop.entradio.sk/api/graphql";
const EVENTS_QUERY = `
  query CinemaEvents($clientId: Int!, $filter: EventsFilterInput!, $paginationInput: PaginationInput!) {
    paginatedEventsOnEcommerce(clientId: $clientId, filter: $filter, paginationInput: $paginationInput) {
      items {
        id startsAt names { sk en } ecommerceEventURL availableSeatsCount
        auditorium { name }
        formatCode versionCode ageClassificationCode
        show {
          id
          primaryImage(type: poster) { url thumbnails(size: [large]) { size url } }
        }
      }
      pagination { hasMore offset limit }
    }
  }
`;

export async function fetchEntradioEvents({ clientId, venueId, from = new Date().toISOString(), request = fetchWithRetry }) {
  async function query(query, variables, session) {
    const response = await request(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session ? { "e-sid": session } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(`Entradio: ${payload.errors.map((error) => error.message).join("; ")}`);
    if (!payload.data) throw new Error("Invalid Entradio response: missing data");
    return payload.data;
  }

  const login = await query("mutation { loginLead { eSid } }");
  const session = login.loginLead?.eSid;
  if (typeof session !== "string" || !session) throw new Error("Entradio did not return a guest session");
  const events = [];
  let offset = 0;
  for (let page = 0; page < 100; page += 1) {
    const data = await query(EVENTS_QUERY, {
      clientId,
      // Do not filter by online-sale availability: sold-out/box-office events belong in the programme too.
      filter: { venueId, state: "published", showOnWebsiteAndApi: true, from },
      paginationInput: { offset, limit: 100 },
    }, session);
    const result = data.paginatedEventsOnEcommerce;
    if (!Array.isArray(result?.items) || typeof result.pagination?.hasMore !== "boolean") {
      throw new Error("Invalid Entradio programme response");
    }
    events.push(...result.items);
    if (!result.pagination.hasMore) return events;
    // Entradio returns the next offset, rather than the offset of the current page.
    const nextOffset = result.pagination.offset;
    if (!result.items.length || !Number.isInteger(nextOffset) || nextOffset <= offset) {
      throw new Error("Entradio pagination did not advance");
    }
    offset = nextOffset;
  }
  throw new Error("Entradio pagination exceeded 100 pages");
}
