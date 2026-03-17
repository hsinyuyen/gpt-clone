import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { ZhuyinProvider } from '@/contexts/ZhuyinContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { MemoryProvider } from '@/contexts/MemoryContext'
import { CoinProvider } from '@/contexts/CoinContext'
import { ConversationProvider } from '@/contexts/ConversationContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import CoinRewardListener from '@/components/CoinRewardListener'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <MemoryProvider>
        <CoinProvider>
          <ConversationProvider>
            <ThemeProvider>
              <CoinRewardListener>
                <ZhuyinProvider>
                  <Component {...pageProps} />
                </ZhuyinProvider>
              </CoinRewardListener>
            </ThemeProvider>
          </ConversationProvider>
        </CoinProvider>
      </MemoryProvider>
    </AuthProvider>
  )
}
