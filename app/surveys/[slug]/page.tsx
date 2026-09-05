export { default, generateMetadata } from "@/entities/portal/routes/surveys/[slug]/page";

export const dynamic = "force-dynamic";
// force-dynamic alone does not stop the Supabase reads below from being served
// from Next's Data Cache, so an edited or deleted survey can keep rendering its
// old form. Opt every fetch on this route out of the cache so survey state is
// always read live.
export const fetchCache = "force-no-store";
