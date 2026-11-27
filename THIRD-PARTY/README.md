# Third-party components added in V5.4.13

- NVIDIA Riva protocol definitions: MIT, with an Apache-2.0 notice also present in `riva_asr.proto`; see `RIVA-MIT.txt` and `APACHE-2.0.txt`. Source: https://github.com/nvidia-riva/common/tree/main/riva/proto
- `@grpc/grpc-js` and `@grpc/proto-loader`: Apache-2.0; see `APACHE-2.0.txt` and each installed package's license.
- `@indic-transliteration/sanscript` and `@indic-transliteration/common_maps`: MIT; see `SANSCRIPT-MIT.txt` and `COMMON-MAPS-MIT.txt`. Their TOML dependency is overridden to 5.0.1; see `TOML-MIT.txt`.
- `ffmpeg-static`: GPL-3.0-or-later, see `FFMPEG-STATIC-GPL-3.0.txt`. The installed FFmpeg executable is downloaded by npm and has its own GPL-family license; see `FFMPEG-BINARY-LICENSE.txt` and its accompanying `ffmpeg.README` in the installed package. The release does not bundle the executable. Source/build information: https://github.com/eugeneware/ffmpeg-static and https://johnvansickle.com/ffmpeg/ .

See the root README and existing license/attribution files for other dependencies and media attribution. This notice does not grant rights to third-party video or artwork.
