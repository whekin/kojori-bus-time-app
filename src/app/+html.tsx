import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import { webPath } from '@/utils/web-base';

export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <title>Gzaap — Tbilisi Bus Times</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content="Live departures, offline timetables and maps for the TTC buses, metro and cable cars you ride in Tbilisi." />
        <link rel="manifest" href={webPath('/manifest.webmanifest')} />
        <link rel="apple-touch-icon" href={webPath('/icons/apple-touch-icon.png')} />
        <meta name="theme-color" content="#0F0B10" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Gzaap" />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
