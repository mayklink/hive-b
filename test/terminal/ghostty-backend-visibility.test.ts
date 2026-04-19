import { beforeEach, describe, expect, test, vi } from 'vitest'
import { GhosttyBackend } from '../../src/renderer/src/components/terminal/backends/GhosttyBackend'

const mockTerminalOps = {
  ghosttyInit: vi.fn().mockResolvedValue({ success: true }),
  ghosttyCreateSurface: vi.fn().mockResolvedValue({ success: true, surfaceId: 1 }),
  ghosttySetFocus: vi.fn().mockResolvedValue(undefined),
  ghosttySetFrame: vi.fn().mockResolvedValue(undefined),
  ghosttySetSize: vi.fn().mockResolvedValue(undefined),
  ghosttyDestroySurface: vi.fn().mockResolvedValue(undefined)
}

const observers: MockResizeObserver[] = []

class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  private callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    observers.push(this)
  }

  trigger(target: Element): void {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect()
        } as ResizeObserverEntry
      ],
      this as unknown as ResizeObserver
    )
  }
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('GhosttyBackend visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    observers.length = 0

    Object.defineProperty(window, 'terminalOps', {
      value: mockTerminalOps,
      writable: true,
      configurable: true
    })

    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal(
      'requestAnimationFrame',
      ((callback: FrameRequestCallback) => setTimeout(() => callback(0), 0)) as typeof requestAnimationFrame
    )
    vi.stubGlobal('cancelAnimationFrame', ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame)
  })

  test('hides and restores native surface when visibility changes', async () => {
    const backend = new GhosttyBackend()
    const container = document.createElement('div')
    container.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 80,
      width: 640,
      height: 360,
      right: 740,
      bottom: 440,
      x: 100,
      y: 80,
      toJSON: () => ({})
    }))

    backend.mount(
      container,
      {
        terminalId: 'wt-1',
        cwd: '/tmp/wt-1'
      },
      {
        onStatusChange: vi.fn()
      }
    )

    await flushPromises()

    const visibilityBackend = backend as unknown as { setVisible: (visible: boolean) => void }

    expect(() => visibilityBackend.setVisible(false)).not.toThrow()
    expect(mockTerminalOps.ghosttySetFocus).toHaveBeenCalledWith('wt-1', false)

    const hiddenFrame = mockTerminalOps.ghosttySetFrame.mock.calls.at(-1)?.[1]
    expect(hiddenFrame.x).toBeLessThan(0)
    expect(hiddenFrame.y).toBeLessThan(0)
    expect(hiddenFrame.w).toBe(640)
    expect(hiddenFrame.h).toBe(360)
    expect(mockTerminalOps.ghosttyDestroySurface).not.toHaveBeenCalled()

    mockTerminalOps.ghosttySetFocus.mockClear()

    visibilityBackend.setVisible(true)

    const visibleFrame = mockTerminalOps.ghosttySetFrame.mock.calls.at(-1)?.[1]
    expect(visibleFrame).toEqual({ x: 100, y: 80, w: 640, h: 360 })
    expect(mockTerminalOps.ghosttyDestroySurface).not.toHaveBeenCalled()

    // Focus must be restored when becoming visible again so that
    // focusedSurfaceId() returns this surface for the menu paste handler.
    expect(mockTerminalOps.ghosttySetFocus).toHaveBeenCalledWith('wt-1', true)

    backend.dispose()
  })

  test('restores the surface frame without stealing focus from an active web input', async () => {
    const backend = new GhosttyBackend()
    const container = document.createElement('div')
    container.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 80,
      width: 640,
      height: 360,
      right: 740,
      bottom: 440,
      x: 100,
      y: 80,
      toJSON: () => ({})
    }))

    backend.mount(
      container,
      {
        terminalId: 'wt-1',
        cwd: '/tmp/wt-1'
      },
      {
        onStatusChange: vi.fn()
      }
    )

    await flushPromises()

    const visibilityBackend = backend as unknown as { setVisible: (visible: boolean) => void }
    visibilityBackend.setVisible(false)
    mockTerminalOps.ghosttySetFocus.mockClear()
    mockTerminalOps.ghosttySetFrame.mockClear()

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    visibilityBackend.setVisible(true)

    const visibleFrame = mockTerminalOps.ghosttySetFrame.mock.calls.at(-1)?.[1]
    expect(visibleFrame).toEqual({ x: 100, y: 80, w: 640, h: 360 })
    expect(mockTerminalOps.ghosttySetFocus).not.toHaveBeenCalledWith('wt-1', true)
    expect(document.activeElement).toBe(input)

    input.remove()
    backend.dispose()
  })

  test('waits for a measurable container instead of failing on initial zero-size mount', async () => {
    const backend = new GhosttyBackend()
    const onStatusChange = vi.fn()
    const container = document.createElement('div')
    let rect = {
      left: 100,
      top: 80,
      width: 0,
      height: 0,
      right: 100,
      bottom: 80,
      x: 100,
      y: 80,
      toJSON: () => ({})
    }
    container.getBoundingClientRect = vi.fn(() => rect)

    backend.mount(
      container,
      {
        terminalId: 'wt-1',
        cwd: '/tmp/wt-1'
      },
      {
        onStatusChange
      }
    )

    await flushPromises()

    expect(mockTerminalOps.ghosttyInit).not.toHaveBeenCalled()
    expect(mockTerminalOps.ghosttyCreateSurface).not.toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenNthCalledWith(1, 'creating')
    expect(onStatusChange).not.toHaveBeenCalledWith('exited')

    rect = {
      ...rect,
      width: 640,
      height: 360,
      right: 740,
      bottom: 440
    }
    observers[0].trigger(container)

    await flushPromises()
    await flushPromises()

    expect(mockTerminalOps.ghosttyInit).toHaveBeenCalledTimes(1)
    expect(mockTerminalOps.ghosttyCreateSurface).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenNthCalledWith(2, 'running')
    expect(onStatusChange).not.toHaveBeenCalledWith('exited')

    backend.dispose()
  })

  test('destroys native surface when dispose races with in-flight createSurface', async () => {
    const backend = new GhosttyBackend()
    const container = document.createElement('div')
    container.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 640,
      height: 360,
      right: 640,
      bottom: 360,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }))

    // Make ghosttyCreateSurface hang so dispose happens before it resolves.
    let resolveCreate!: (value: { success: true; surfaceId: number }) => void
    mockTerminalOps.ghosttyCreateSurface.mockImplementationOnce(
      () =>
        new Promise<{ success: true; surfaceId: number }>((resolve) => {
          resolveCreate = resolve
        })
    )

    backend.mount(
      container,
      {
        terminalId: 'wt-1',
        cwd: '/tmp/wt-1'
      },
      {
        onStatusChange: vi.fn()
      }
    )

    // Let the runtime init finish and createSurface kick off, but not resolve.
    await flushPromises()
    expect(mockTerminalOps.ghosttyCreateSurface).toHaveBeenCalledTimes(1)
    expect(mockTerminalOps.ghosttyDestroySurface).not.toHaveBeenCalled()

    // Unmount while createSurface is still in flight.
    backend.dispose()

    // Now the native side finishes creating the surface AFTER dispose.
    resolveCreate({ success: true, surfaceId: 1 })
    await flushPromises()
    await flushPromises()

    // The orphaned native surface must be destroyed to avoid leaking NSViews.
    expect(mockTerminalOps.ghosttyDestroySurface).toHaveBeenCalledWith('wt-1')
  })
})
