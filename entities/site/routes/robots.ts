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
    sitemap: 'https://www.edge8.ai/sitemap.xml',
    host: 'https://www.edge8.ai',
  }
}
