type Primitive = string | number | boolean | null | undefined | Date;
type NodeValue = Primitive | NodeObject | NodeValue[] | undefined | null;
interface NodeObject {
    [key: string]: NodeValue;
}
declare class ParseError extends Error {
    readonly lineNumber?: number | undefined;
    readonly line?: string | undefined;
    constructor(message: string, lineNumber?: number | undefined, line?: string | undefined);
}
export { ParseError, type NodeObject, type NodeValue, type Primitive };
declare const _default: {
    parse: <T extends NodeObject = NodeObject>(input: string) => T;
};
export default _default;
//# sourceMappingURL=parser.d.ts.map