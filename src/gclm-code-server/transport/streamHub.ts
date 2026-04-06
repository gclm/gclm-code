export type StreamEvent = {
  type: string
  data: unknown
}

export type StreamSubscriber = {
  id: string
  send(event: StreamEvent): void
}

export class StreamHub {
  private readonly subscribers = new Map<string, Map<string, StreamSubscriber>>()

  subscribe(sessionId: string, subscriber: StreamSubscriber): () => void {
    let bucket = this.subscribers.get(sessionId)
    if (!bucket) {
      bucket = new Map<string, StreamSubscriber>()
      this.subscribers.set(sessionId, bucket)
    }

    bucket.set(subscriber.id, subscriber)

    return () => {
      const current = this.subscribers.get(sessionId)
      if (!current) {
        return
      }

      current.delete(subscriber.id)
      if (current.size === 0) {
        this.subscribers.delete(sessionId)
      }
    }
  }

  publish(sessionId: string, event: StreamEvent): void {
    const bucket = this.subscribers.get(sessionId)
    if (!bucket) {
      return
    }

    for (const subscriber of bucket.values()) {
      subscriber.send(event)
    }
  }

  subscriberCount(sessionId: string): number {
    return this.subscribers.get(sessionId)?.size ?? 0
  }
}
