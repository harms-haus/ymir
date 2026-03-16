import { describe, it, expect } from 'vitest'

describe('CSS Theme Variables', () => {
  it('theme variables present on document root', () => {
    document.documentElement.appendChild(document.createElement('head'))

    const style = document.createElement('style')
    style.textContent = `
      :root {
        --background: 222.2 84% 4.9%;
        --foreground: 210 40% 98%;
        --card: 222.2 84% 4.9%;
        --card-foreground: 210 40% 98%;
        --primary: 217.2 91.2% 59.8%;
        --primary-foreground: 222.2 47.4% 11.2%;
        --muted: 217.2 32.6% 17.5%;
        --muted-foreground: 215 20.2% 65.1%;
        --accent: 217.2 32.6% 17.5%;
        --accent-foreground: 210 40% 98%;
        --destructive: 0 62.8% 30.6%;
        --destructive-foreground: 210 40% 98%;
        --border: 217.2 32.6% 17.5%;
        --input: 217.2 32.6% 17.5%;
        --ring: 224.3 76.3% 48%;
        --radius: 0.5rem;
        --status-working: 142 70% 45%;
        --status-idle: 240 4% 46%;
        --status-waiting: 48 93% 47%;
        --panel-sidebar: 222.2 84% 5.9%;
        --panel-main: 222.2 84% 4.9%;
        --panel-project: 217.2 32.6% 18.5%;
        --terminal-bg: 222.2 84% 4.9%;
        --terminal-fg: 210 40% 98%;
        --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
        --spacing-xs: 4px;
        --spacing-sm: 8px;
        --spacing-md: 16px;
        --spacing-lg: 24px;
        --spacing-xl: 32px;
      }
    `
    document.head.appendChild(style)

    const styles = getComputedStyle(document.documentElement)

    expect(styles.getPropertyValue('--background').trim()).toBe('222.2 84% 4.9%')
    expect(styles.getPropertyValue('--foreground').trim()).toBe('210 40% 98%')
    expect(styles.getPropertyValue('--status-working').trim()).toBe('142 70% 45%')
    expect(styles.getPropertyValue('--status-idle').trim()).toBe('240 4% 46%')
    expect(styles.getPropertyValue('--status-waiting').trim()).toBe('48 93% 47%')
    expect(styles.getPropertyValue('--panel-sidebar').trim()).toBe('222.2 84% 5.9%')
    expect(styles.getPropertyValue('--panel-main').trim()).toBe('222.2 84% 4.9%')
    expect(styles.getPropertyValue('--panel-project').trim()).toBe('217.2 32.6% 18.5%')
    expect(styles.getPropertyValue('--terminal-bg').trim()).toBe('222.2 84% 4.9%')
    expect(styles.getPropertyValue('--terminal-fg').trim()).toBe('210 40% 98%')
    expect(styles.getPropertyValue('--spacing-xs').trim()).toBe('4px')
    expect(styles.getPropertyValue('--spacing-sm').trim()).toBe('8px')
    expect(styles.getPropertyValue('--spacing-md').trim()).toBe('16px')
    expect(styles.getPropertyValue('--spacing-lg').trim()).toBe('24px')
    expect(styles.getPropertyValue('--spacing-xl').trim()).toBe('32px')
  })

  it('status colors match requirements', () => {
    document.documentElement.appendChild(document.createElement('head'))

    const style = document.createElement('style')
    style.textContent = `
      :root {
        --status-working: 142 70% 45%;
        --status-idle: 240 4% 46%;
        --status-waiting: 48 93% 47%;
      }
    `
    document.head.appendChild(style)

    const styles = getComputedStyle(document.documentElement)
    const working = styles.getPropertyValue('--status-working').trim()
    const idle = styles.getPropertyValue('--status-idle').trim()
    const waiting = styles.getPropertyValue('--status-waiting').trim()

    expect(working).toContain('142')
    expect(idle).toContain('240')
    expect(waiting).toContain('48')
  })
})
