// Browser-side upload to a Supabase Storage signed upload URL.
//
// It is XHR and not fetch because only XHR reports upload progress, and the
// three document uploaders (admin CRM, team client hub, portal program
// onboarding) all render a per-file progress bar. Progress is scaled to 0.95 so
// the bar never reads "done" while the caller is still recording the row.
//
// The body is multipart with an empty field name and `cacheControl`, which is
// the shape Supabase Storage's signed-upload endpoint expects; `x-upsert: false`
// makes a collision fail loudly rather than overwrite someone's document.

const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function putToSignedUrl(signedUrl: string, file: File, onProgress: (p: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    if (SUPABASE_KEY) xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 0.95);
    };
    xhr.onload = () =>
      resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, error: `Upload failed (${xhr.status}).` });
    xhr.onerror = () => resolve({ ok: false, error: "Network error." });
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", file);
    xhr.send(fd);
  });
}
