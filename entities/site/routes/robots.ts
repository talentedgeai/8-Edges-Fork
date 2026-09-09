import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/t/', '/workflows/private/', '/board/'],
      },
    ],
    sitemap: 'https://arca-wellness.vercel.app/sitemap.xml',
    host: 'https://arca-wellness.vercel.app',
  }
}
