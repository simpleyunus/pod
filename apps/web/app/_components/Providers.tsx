'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, theme } from 'antd';
import { useState } from 'react';

// "Ink & Signal": ink for structure and primary actions, one signal-orange
// accent for interactive states, warm paper canvas, soft borders.

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            // signal drives interactive accents: switches, radios, focus states
            colorPrimary: '#E8503A',
            colorInfo: '#E8503A',
            colorLink: '#C13A26',
            colorLinkHover: '#E8503A',
            colorText: '#171B26',
            colorTextSecondary: '#616875',
            colorTextTertiary: '#98A0AC',
            colorBorder: '#E3E9EF',
            colorBorderSecondary: '#EDF1F6',
            colorBgContainer: '#FFFFFF',
            colorBgLayout: '#F2F5F8',
            borderRadius: 10,
            controlHeight: 34,
            fontFamily: 'var(--font-body), -apple-system, "Segoe UI", sans-serif',
            fontSize: 13,
            boxShadow: '0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)',
          },
          components: {
            // primary buttons are ink — signal stays reserved for accents
            Button: {
              colorPrimary: '#0E1B2A',
              colorPrimaryHover: '#1D2939',
              colorPrimaryActive: '#0A1420',
              primaryShadow: '0 1px 2px rgba(16,24,40,.2)',
              defaultBorderColor: '#E3E9EF',
              defaultShadow: '0 1px 2px rgba(16,24,40,.04)',
              fontWeight: 600,
            },
            Table: {
              headerBg: 'transparent',
              headerColor: '#98A0AC',
              headerSortActiveBg: '#F2F5F8',
              headerSortHoverBg: '#F2F5F8',
              rowHoverBg: '#FAFAF7',
              borderColor: '#EDF1F6',
              cellPaddingBlock: 14,
              fontSize: 13,
            },
            Menu: {
              darkItemBg: 'transparent',
              darkItemSelectedBg: 'rgba(255,255,255,0.08)',
              darkItemHoverBg: 'rgba(255,255,255,0.05)',
              darkItemColor: 'rgba(255,255,255,0.55)',
              darkItemSelectedColor: '#ffffff',
              darkItemHoverColor: 'rgba(255,255,255,0.85)',
              itemBorderRadius: 8,
              itemMarginInline: 10,
            },
            Card: {
              boxShadow: '0 1px 2px rgba(16,24,40,.04)',
              colorBorderSecondary: '#E3E9EF',
              borderRadiusLG: 14,
              headerFontSize: 13,
            },
            Tabs: {
              inkBarColor: '#E8503A',
              itemActiveColor: '#171B26',
              itemSelectedColor: '#171B26',
              itemHoverColor: '#3A4150',
              itemColor: '#98A0AC',
              titleFontSize: 13,
            },
            Input: {
              activeBorderColor: '#E8503A',
              hoverBorderColor: '#D3DCE5',
              activeShadow: '0 0 0 3px rgba(232,80,58,.10)',
            },
            Select: {
              optionSelectedBg: '#FDEDE9',
              optionActiveBg: '#F2F5F8',
              activeBorderColor: '#E8503A',
              hoverBorderColor: '#D3DCE5',
              activeOutlineColor: 'rgba(232,80,58,.10)',
            },
            Segmented: {
              trackBg: '#EDEDE8',
              itemSelectedBg: '#FFFFFF',
              itemSelectedColor: '#171B26',
              itemColor: '#616875',
              trackPadding: 3,
            },
            Tag: { borderRadius: 6 },
            Badge: { colorPrimary: '#E8503A' },
            Radio: { buttonSolidCheckedBg: '#0E1B2A' },
            Drawer: { borderRadiusLG: 16 },
            Modal: { borderRadiusLG: 16 },
            Message: { borderRadiusLG: 12 },
            Timeline: { tailColor: '#E3E9EF' },
            Switch: { colorPrimary: '#E8503A', colorPrimaryHover: '#C13A26' },
            Pagination: { colorPrimary: '#171B26', colorPrimaryHover: '#E8503A' },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </QueryClientProvider>
  );
}
