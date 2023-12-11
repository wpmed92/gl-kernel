# gl-kernel

glKernel is an ultra light-weight WebGL2 compute library. Define your compute shader, pass in you data, and get the output without writing any boilterplate code.

## Usage

```JavaScript
import { glKernel } from 'gl-kernel';

const elementwise = `
    float add(in sampler2D data0, in sampler2D data1, int idx) {
        return read(data0, idx) + read(data1, idx);
    }
`
const a = new Float32Array([0.5, 0.5]);
const b = new Float32Array([1.6, 1.6]);
const out = new Float32Array(2);
glKernel.compute({entry: "add", code: elementwise}, [a, b], out);
console.log(out);
```

## License

MIT