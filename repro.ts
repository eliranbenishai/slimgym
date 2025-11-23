import sg from './index'

const data = {
    // Array of primitives
    tags: ["a", "b"],

    // Array of objects
    users: [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 }
    ],

    // Nested structure similar to example.sg items
    items: {
        item: [
            { sku: "1", price: 10 },
            { sku: "2", price: 20 }
        ]
    }
}

console.log(sg.slimgify(data))
