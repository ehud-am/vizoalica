export class BoundedQueue<T> {
  private readonly items: T[] = [];

  constructor(private readonly maxSize: number) {}

  enqueue(item: T): void {
    if (this.items.length >= this.maxSize) this.items.shift();
    this.items.push(item);
  }

  drain(maxItems = this.items.length): T[] {
    return this.items.splice(0, maxItems);
  }

  requeueFront(items: T[]): void {
    this.items.unshift(...items);
    while (this.items.length > this.maxSize) this.items.pop();
  }

  get size(): number {
    return this.items.length;
  }
}
