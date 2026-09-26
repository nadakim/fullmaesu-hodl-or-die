/* ══════════════════════════════════════════════════════════
   MUSIC — 코드로 작곡한 칩튠 BGM (Web Audio 오실레이터 + 노이즈만, 음원 파일·외부 라이브러리 없음). UI 전용.
   엔진(engine.js)은 이 파일을 모른다. docs/demo가 화면·게임 상태를 읽어 Music.setTrack / setMood / stinger를 부른다.

   채널 (패미컴 4채널 + 적응형 레이어 2개)
     p1 사각파 멜로디 (듀티 12.5 / 25 / 50%) · p2 사각파 화음·아르페지오 · tri 삼각파 베이스 · noise 드럼
     lead2 = p1을 한 옥타브 위로 (market BULL) · ring = 낮은 전화벨 트릴 (market 금감원 경고)
   곡 데이터 (트래커): { key, bpm, stepsPerBeat, beatsPerBar, patterns: { 이름: { 채널: [마디, …] } }, order: [패턴 이름 …] }
     마디 = 공백으로 나눈 칸 문자열. 'C4' 'D#5' = 음 (C4 = 가운데 도), '-' = 앞 음 유지, '.' = 쉼표.
     드럼 칸: K 킥 · S 스네어 · H 닫힌 하이햇 · O 열린 하이햇 · '.' 쉼.
     한 패턴의 마디 수는 채널 중 가장 긴 것. 짧은 채널은 되풀이한다 (같은 반주를 여러 마디에).
     JSON으로 그대로 옮길 수 있게 문자열만 쓴다 (Unity 이식 · MIDI 변환용).
   market 적응형: 패턴의 bull / bear 덮어쓰기 + layers.octave · siren · ring · breakbeat. 전환은 다음 마디 첫 칸에서만.
══════════════════════════════════════════════════════════ */

/* ── 곡 데이터 ─────────────────────────────────────────── */
const SONGS = {

  /* title — C장조 132 · 뽕짝(쿵-짝) 칩튠. A(4) A'(4) B(8) = 16마디. 훅 = A 첫 4마디 */
  title: {
    key: 'C major', bpm: 132, stepsPerBeat: 4, beatsPerBar: 4, duty: { p1: 0.25, p2: 0.125 },
    patterns: {
      A: {
        p1:  ['E5 - G5 - A5 - G5 - E5 - D5 - C5 - - -', 'A4 - C5 - E5 - D5 C5 A4 - - - . . . .',
              'C5 - C5 D5 E5 - F5 - A5 - G5 - F5 - E5 -', 'D5 - - - G5 - - - G4 - A4 - B4 - D5 -'],
        p2:  ['. . E4 . . . G4 . . . E4 . . . C5 .', '. . C4 . . . E4 . . . C4 . . . A4 .',
              '. . A4 . . . C5 . . . A4 . . . F4 .', '. . B4 . . . D5 . . . B4 . . . G4 .'],
        tri: ['C3 - . . G2 - . . C3 - . . G2 - . .', 'A2 - . . E2 - . . A2 - . . E2 - . .',
              'F2 - . . C3 - . . F2 - . . C3 - . .', 'G2 - . . D3 - . . G2 - . . B2 - . .'],
        noise: ['K . H . S . H . K . H K S . H .']
      },
      A2: {
        p1:  ['E5 - G5 - A5 - G5 - E5 - D5 - C5 - - -', 'A4 - C5 - E5 - D5 C5 A4 - - - . . . .',
              'C5 - C5 D5 E5 - F5 - A5 - G5 - F5 - E5 -', 'D5 - E5 - D5 - C5 - C5 - - - . . . .'],
        p2:  ['. . E4 . . . G4 . . . E4 . . . C5 .', '. . C4 . . . E4 . . . C4 . . . A4 .',
              '. . A4 . . . C5 . . . A4 . . . F4 .', '. . B4 . . . D5 . . . E4 . . . G4 .'],
        tri: ['C3 - . . G2 - . . C3 - . . G2 - . .', 'A2 - . . E2 - . . A2 - . . E2 - . .',
              'F2 - . . C3 - . . F2 - . . C3 - . .', 'G2 - . . D3 - . . C3 - . . G2 - . .'],
        noise: ['K . H . S . H . K . H K S . H .', 'K . H . S . H . K . H K S . H .',
                'K . H . S . H . K . H K S . H .', 'K . S . K . S S K S S S S S S S']
      },
      B: {   // "가즈아" — 높은 음으로 치고 올라가는 후렴
        p1:  ['A5 - A5 - A5 - G5 - F5 - G5 - A5 - - -', 'B5 - B5 - B5 - A5 - G5 - - - D5 - - -',
              'G5 - E5 - G5 - E5 - B5 - A5 - G5 - E5 -', 'A5 - - - - - - - C6 - B5 - A5 - G5 -',
              'A5 - F5 - A5 - C6 - - - A5 - G5 - F5 -', 'G5 - - - D5 - G5 - B5 - - - D6 - - -',
              'C6 - - - G5 - E5 - C5 - - - E5 - G5 -', 'C6 - - - - - - - . . . . . . . .'],
        p2:  ['. . A4 . . . C5 . . . A4 . . . F4 .', '. . B4 . . . D5 . . . B4 . . . G4 .',
              '. . G4 . . . B4 . . . G4 . . . E4 .', '. . C5 . . . E5 . . . C5 . . . A4 .',
              '. . A4 . . . C5 . . . A4 . . . F4 .', '. . B4 . . . D5 . . . B4 . . . G4 .',
              '. . E4 . . . G4 . . . E4 . . . C5 .', 'C5 - - - - - - - . . . . . . . .'],
        tri: ['F2 - . . C3 - . . F2 - . . C3 - . .', 'G2 - . . D3 - . . G2 - . . D3 - . .',
              'E2 - . . B2 - . . E2 - . . B2 - . .', 'A2 - . . E2 - . . A2 - . . E2 - . .',
              'F2 - . . C3 - . . F2 - . . C3 - . .', 'G2 - . . D3 - . . G2 - . . B2 - . .',
              'C3 - . . G2 - . . C3 - . . G2 - . .', 'C3 - - - - - - - G2 - . . B2 - . .'],
        noise: ['K . H . S . H O K . H K S . O H', 'K . H . S . H O K . H K S . O H',
                'K . H . S . H O K . H K S . O H', 'K . H . S . H O K . K K S S S S',
                'K . H . S . H O K . H K S . O H', 'K . H . S . H O K . H K S . O H',
                'K . H . S . H O K . H K S . O H', 'K . . . S . . . K S S S S S S S']
      }
    },
    order: ['A', 'A2', 'B']
  },

  /* premarket — A단조 90 (title의 나란한조) · 느린 4분 아르페지오, 드럼은 시계 틱뿐. A(8) B(8) = 16마디 */
  premarket: {
    key: 'A minor', bpm: 90, stepsPerBeat: 2, beatsPerBar: 4, duty: { p1: 0.125, p2: 0.25 },
    vol: { p1: 0.5, p2: 0.36, tri: 0.6, noise: 0.3 },
    patterns: {
      A: {
        p1:  ['. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'E5 - . . D5 - B4 -',
              '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', 'E5 - . . G#4 - B4 -'],
        p2:  ['A3 - C4 - E4 - C4 -', 'A3 - C4 - E4 - C4 -', 'F3 - A3 - C4 - A3 -', 'E3 - G#3 - B3 - G#3 -',
              'A3 - C4 - E4 - C4 -', 'D3 - F3 - A3 - F3 -', 'E3 - G#3 - B3 - G#3 -', 'E3 - G#3 - B3 - D4 -'],
        tri: ['A2 - - - - - - -', 'A2 - - - - - - -', 'F2 - - - - - - -', 'E2 - - - - - - -',
              'A2 - - - - - - -', 'D2 - - - - - - -', 'E2 - - - - - - -', 'E2 - - - - - - -'],
        noise: ['H . . . H . . .']
      },
      B: {
        p1:  ['E5 - - - D5 - C5 -', 'B4 - - - - - . .', 'C5 - - - B4 - A4 -', 'A4 - - - - - . .',
              'F5 - - - E5 - D5 -', 'E5 - - - G#4 - - -', 'A4 - - - - - - -', '. . . . . . . .'],
        p2:  ['F3 - A3 - C4 - A3 -', 'G3 - B3 - D4 - B3 -', 'A3 - C4 - E4 - C4 -', 'A3 - C4 - E4 - C4 -',
              'D3 - F3 - A3 - F3 -', 'E3 - G#3 - B3 - G#3 -', 'A3 - C4 - E4 - C4 -', 'E3 - G#3 - B3 - G#3 -'],
        tri: ['F2 - - - - - - -', 'G2 - - - - - - -', 'A2 - - - - - - -', 'A2 - - - - - - -',
              'D2 - - - - - - -', 'E2 - - - - - - -', 'A2 - - - - - - -', 'E2 - - - - - - -'],
        noise: ['H . . . H . . .']
      }
    },
    order: ['A', 'B']
  },

  /* market — E단조 128 (premarket A단조의 딸림조) · 16비트 하이햇 + 8분 베이스 오스티나토. A B A C = 16마디.
     적응형: bull = G장조(나란한조) 코드 + 멜로디 옥타브 레이어 / bear = 반음씩 내려가는 베이스, 하이햇 제거 /
             VOLATILE = 브레이크비트 + 비브라토 / 위험 = pulse2 사이렌 / 금감원 경고 = 베이스 아래 전화벨 / 장 마감 쪽으로 템포 +12% */
  market: {
    key: 'E minor', bpm: 128, stepsPerBeat: 4, beatsPerBar: 4, duty: { p1: 0.25, p2: 0.5 }, adaptive: true,
    vol: { p1: 0.85, p2: 0.5, tri: 1, noise: 0.8 },
    patterns: {
      A: {   // Em | C | D | B
        p1:  ['B4 . B4 . E5 . B4 . G5 - F#5 - E5 - D5 -', 'E5 - - - C5 . E5 . G5 - E5 - C5 - . .',
              'D5 - F#5 - A5 - F#5 - D5 . D5 . E5 - F#5 -', 'D#5 - - - F#5 - - - B5 - A5 - G5 - F#5 -'],
        p2:  ['. . G4 . . . B4 . . . G4 . . . B4 .', '. . E4 . . . G4 . . . E4 . . . G4 .',
              '. . F#4 . . . A4 . . . F#4 . . . A4 .', '. . D#4 . . . F#4 . . . D#4 . . . A4 .'],
        tri: ['E2 . E2 . E3 . E2 . E2 . E3 . D3 . B2 .', 'C2 . C2 . C3 . C2 . C2 . C3 . B2 . G2 .',
              'D2 . D2 . D3 . D2 . D2 . D3 . C3 . A2 .', 'B1 . B1 . B2 . B1 . B1 . B2 . D#3 . F#2 .'],
        noise: ['K H H H S H H H K H K H S H H H'],
        bull: {   // G | C | D | G
          p2:  ['. . B4 . . . D5 . . . B4 . . . G4 .', '. . E4 . . . G4 . . . C5 . . . G4 .',
                '. . F#4 . . . A4 . . . D5 . . . A4 .', '. . B4 . . . D5 . . . G4 . . . B4 .'],
          tri: ['G2 . G2 . G3 . G2 . G2 . G3 . F#3 . D3 .', 'C2 . C2 . C3 . C2 . C2 . C3 . D3 . E3 .',
                'D2 . D2 . D3 . D2 . D2 . D3 . E3 . F#3 .', 'G2 . G2 . G3 . G2 . G2 . B2 . D3 . G3 .']
        },
        bear: {   // 반음씩 가라앉는 베이스
          tri: ['E2 . E2 . D#2 . D#2 . D2 . D2 . C#2 . C#2 .', 'C2 . C2 . B1 . B1 . A#1 . A#1 . A1 . A1 .',
                'D2 . D2 . C#2 . C#2 . C2 . C2 . B1 . B1 .', 'B1 . B1 . A#1 . A#1 . A1 . A1 . G#1 . G#1 .']
        }
      },
      B: {   // Am | B | Em | Em
        p1:  ['A5 - C6 - A5 - E5 - A5 - C6 - B5 - A5 -', 'B5 - - - D#5 - F#5 - B5 - - - A5 - G5 -',
              'G5 - E5 - B4 - E5 - G5 - B5 - E6 - - -', 'D6 - B5 - G5 - E5 - F#5 - G5 - A5 - B5 -'],
        p2:  ['. . C5 . . . E5 . . . C5 . . . A4 .', '. . D#5 . . . F#5 . . . D#5 . . . B4 .',
              '. . G4 . . . B4 . . . G4 . . . E4 .', '. . G4 . . . B4 . . . D5 . . . B4 .'],
        tri: ['A1 . A1 . A2 . A1 . A1 . A2 . G2 . E2 .', 'B1 . B1 . B2 . B1 . B1 . B2 . A2 . F#2 .',
              'E2 . E2 . E3 . E2 . E2 . E3 . D3 . B2 .', 'E2 . E2 . E3 . E2 . E2 . G2 . A2 . B2 .'],
        noise: ['K H H H S H H H K H K H S H H H', 'K H H H S H H H K H K H S H H H',
                'K H H H S H H H K H K H S H H H', 'K H K H S H K H K H K H S S S S'],
        bull: {   // C | D | G | G
          p2:  ['. . E5 . . . G5 . . . E5 . . . C5 .', '. . F#5 . . . A5 . . . F#5 . . . D5 .',
                '. . B4 . . . D5 . . . B4 . . . G4 .', '. . B4 . . . D5 . . . G5 . . . D5 .'],
          tri: ['C2 . C2 . C3 . C2 . C2 . C3 . B2 . G2 .', 'D2 . D2 . D3 . D2 . D2 . D3 . C3 . A2 .',
                'G2 . G2 . G3 . G2 . G2 . G3 . F#3 . D3 .', 'G2 . G2 . G3 . G2 . G2 . B2 . C3 . D3 .']
        },
        bear: {
          tri: ['A1 . A1 . G#1 . G#1 . G1 . G1 . F#1 . F#1 .', 'B1 . B1 . A#1 . A#1 . A1 . A1 . G#1 . G#1 .',
                'E2 . E2 . D#2 . D#2 . D2 . D2 . C#2 . C#2 .', 'C2 . C2 . B1 . B1 . A#1 . A#1 . B1 . B1 .']
        }
      },
      C: {   // C | D | B | B — 절정 뒤 맨 처음으로
        p1:  ['E5 . G5 . C6 - B5 - G5 - E5 - C5 - E5 -', 'F#5 . A5 . D6 - C6 - A5 - F#5 - D5 - F#5 -',
              'D#5 - F#5 - B5 - - - A5 - G5 - F#5 - E5 -', 'D#5 - - - - - - - B4 - - - . . . .'],
        p2:  ['. . E4 . . . G4 . . . E4 . . . G4 .', '. . F#4 . . . A4 . . . F#4 . . . A4 .',
              '. . D#4 . . . F#4 . . . D#4 . . . A4 .', 'D#4 - - - - - - - . . . . . . . .'],
        tri: ['C2 . C2 . C3 . C2 . C2 . C3 . B2 . G2 .', 'D2 . D2 . D3 . D2 . D2 . D3 . C3 . A2 .',
              'B1 . B1 . B2 . B1 . B1 . B2 . D#3 . F#2 .', 'B1 - - - - - - - B1 . B1 . B2 . B1 .'],
        noise: ['K H H H S H H H K H K H S H H H', 'K H H H S H H H K H K H S H H H',
                'K H H H S H H H K H K H S H H H', 'K . . . S . . . K S K S S S S S'],
        bull: {   // C | D | G | D
          p2:  ['. . E4 . . . G4 . . . C5 . . . G4 .', '. . F#4 . . . A4 . . . D5 . . . A4 .',
                '. . B4 . . . D5 . . . B4 . . . G4 .', 'F#4 - - - - - - - . . . . . . . .'],
          tri: ['C2 . C2 . C3 . C2 . C2 . C3 . D3 . E3 .', 'D2 . D2 . D3 . D2 . D2 . D3 . E3 . F#3 .',
                'G2 . G2 . G3 . G2 . G2 . G3 . F#3 . D3 .', 'D2 - - - - - - - D2 . D2 . D3 . D2 .']
        },
        bear: {
          tri: ['C2 . C2 . B1 . B1 . A#1 . A#1 . A1 . A1 .', 'D2 . D2 . C#2 . C#2 . C2 . C2 . B1 . B1 .',
                'B1 . B1 . A#1 . A#1 . A1 . A1 . G#1 . G#1 .', 'B1 - - - - - - - A#1 . A1 . G#1 . G1 .']
        }
      }
    },
    layers: {
      octave: true,                                              // BULL: p1을 한 옥타브 위로 겹친다 (lead2)
      siren: ['B5 - - - E5 - - - B5 - - - E5 - - -'],            // 위험: p2 자리에 2음 사이렌
      ring:  ['E3 G3 E3 G3 E3 G3 . . . . . . . . . .', '. . . . . . . . E3 G3 E3 G3 E3 G3 . .'],   // 금감원 경고: 낮은 전화벨
      breakbeat: ['K . . S . K S . . K . S K . S S', 'K . S . . K . S K K . S . S K .',
                  'K . . S K . S . . K S . K . S S', 'K S . K . S K . S . K S S K S S']   // VOLATILE 드럼
    },
    order: ['A', 'B', 'A', 'C']
  },

  /* shop — D단조 100 (premarket A단조의 버금딸림조) · 스윙 8분, 반음계 워킹 베이스, 느와르. A(8) B(8) = 16마디 */
  shop: {
    key: 'D minor', bpm: 100, stepsPerBeat: 2, beatsPerBar: 4, swing: 0.3, duty: { p1: 0.25, p2: 0.125 },
    vol: { p1: 0.62, p2: 0.38, tri: 0.8, noise: 0.45 },
    patterns: {
      A: {   // Dm Dm Gm Gm A7 A7 Dm A7
        p1:  ['D5 - - - C#5 D5 F5 -', 'A4 - - - - - . .', 'A#4 - - - A4 A#4 D5 -', 'G4 - - - - - . .',
              'C#5 - E5 - G5 - F5 E5', 'C#5 - - - A4 - - -', 'D5 - F5 - A5 - G#5 A5', 'E5 - - - . . . .'],
        p2:  ['. F4 . A4 . F4 . A4', '. F4 . A4 . F4 . A4', '. A#4 . D5 . A#4 . D5', '. A#4 . D5 . A#4 . D5',
              '. C#5 . G4 . C#5 . E4', '. C#5 . G4 . C#5 . E4', '. F4 . A4 . F4 . A4', '. C#5 . G4 . C#5 . E4'],
        tri: ['D2 - F2 - A2 - G#2 -', 'A2 - C3 - A2 - F#2 -', 'G2 - A#2 - D3 - C#3 -', 'D3 - A#2 - G2 - G#2 -',
              'A2 - C#3 - E3 - G3 -', 'G3 - F3 - E3 - C#3 -', 'D3 - A2 - F2 - D2 -', 'A1 - C#2 - E2 - G2 -'],
        noise: ['K . H . S . H .', 'K . H . S . H H']
      },
      B: {   // Bb A7 Dm D7 Gm A7 Dm A7
        p1:  ['D6 - C6 - A#5 - F5 -', 'E5 - - - C#5 - A4 -', 'F5 - - - E5 F5 A5 -', 'F#5 - - - A5 - C6 -',
              'A#5 - A5 - G5 - D5 -', 'C#5 - - - E5 - G5 -', 'F5 - - - E5 - D5 -', 'C#5 - - - - - . .'],
        p2:  ['. D5 . F4 . D5 . F4', '. C#5 . G4 . C#5 . E4', '. F4 . A4 . F4 . A4', '. F#4 . C5 . F#4 . C5',
              '. A#4 . D5 . A#4 . D5', '. C#5 . G4 . C#5 . E4', '. F4 . A4 . F4 . A4', '. C#5 . G4 . E4 . A4'],
        tri: ['A#1 - D2 - F2 - A2 -', 'A1 - C#2 - E2 - G2 -', 'D2 - F2 - A2 - C3 -', 'D3 - C3 - A2 - F#2 -',
              'G2 - A#2 - D3 - C#3 -', 'A2 - G2 - E2 - C#2 -', 'D2 - F2 - G#2 - A2 -', 'A1 - - - A2 - - -'],
        noise: ['K . H . S . H .', 'K . H . S . H H', 'K . H . S . H .', 'K . H S S . S S']
      }
    },
    order: ['A', 'B']
  },

  /* records — F장조 80 (shop D단조의 나란한조) · 12.5% 듀티의 여린 멜로디, 드럼 없음. A(8) B(8) = 16마디 */
  records: {
    key: 'F major', bpm: 80, stepsPerBeat: 2, beatsPerBar: 4, duty: { p1: 0.125, p2: 0.25 },
    vol: { p1: 0.55, p2: 0.34, tri: 0.6, noise: 0 },
    patterns: {
      A: {   // F C Dm Bb | F C Bb C
        p1:  ['C5 - - - A4 - - -', 'G4 - - - E4 - G4 -', 'F4 - - - A4 - D5 -', 'D5 - - - - - . .',
              'C5 - A4 - F4 - A4 -', 'G4 - - - - - . .', 'A#4 - A4 - G4 - F4 -', 'E4 - - - G4 - - -'],
        p2:  ['F3 - A3 - C4 - A3 -', 'E3 - G3 - C4 - G3 -', 'D3 - F3 - A3 - F3 -', 'A#2 - D3 - F3 - D3 -',
              'F3 - A3 - C4 - A3 -', 'E3 - G3 - C4 - G3 -', 'A#2 - D3 - F3 - D3 -', 'C3 - E3 - G3 - A#3 -'],
        tri: ['F2 - - - C3 - - -', 'E2 - - - C3 - - -', 'D2 - - - A2 - - -', 'A#1 - - - F2 - - -',
              'F2 - - - C3 - - -', 'C2 - - - G2 - - -', 'A#1 - - - F2 - - -', 'C2 - - - C3 - - -']
      },
      B: {   // Dm Am Bb F | Gm C F F
        p1:  ['D5 - - - F5 - E5 -', 'C5 - - - - - . .', 'D5 - C5 - A#4 - A4 -', 'A4 - - - - - . .',
              'G4 - A#4 - D5 - C5 -', 'A#4 - A4 - G4 - E4 -', 'F4 - - - - - - -', '. . . . . . . .'],
        p2:  ['D3 - F3 - A3 - F3 -', 'A2 - C3 - E3 - C3 -', 'A#2 - D3 - F3 - D3 -', 'F3 - A3 - C4 - A3 -',
              'G3 - A#3 - D4 - A#3 -', 'C3 - E3 - G3 - E3 -', 'F3 - A3 - C4 - A3 -', 'F3 - - - - - - -'],
        tri: ['D2 - - - A2 - - -', 'A1 - - - E2 - - -', 'A#1 - - - F2 - - -', 'F2 - - - C3 - - -',
              'G2 - - - D2 - - -', 'C2 - - - G2 - - -', 'F2 - - - C3 - - -', 'F2 - - - - - - -']
      }
    },
    order: ['A', 'B']
  },

  /* ── 스팅어 (루프 없음) ── */
  tipAlert: {   // 찌라시 도착: 알림음 같은 3음 (1초)
    key: 'C major', bpm: 150, stepsPerBeat: 4, beatsPerBar: 2, loop: false, duty: { p1: 0.125, p2: 0.25 },
    patterns: { A: { p1: ['E6 G6 C7 - - - . .'], p2: ['. . . E6 G6 C7 - .'] } },
    order: ['A']
  },
  weekClear: {   // 주간 결산 통과 팡파레 (약 1.8초)
    key: 'C major', bpm: 140, stepsPerBeat: 4, beatsPerBar: 4, loop: false, duty: { p1: 0.25, p2: 0.5 },
    patterns: { A: {
      p1: ['G4 C5 E5 G5 - - E5 G5 C6 - - - - - - -'], p2: ['E4 G4 C5 E5 - - C5 E5 G5 - - - - - - -'],
      tri: ['C3 - - - - - G2 - C3 - - - - - - -'], noise: ['K . . . S . . . K . K . S S S S'] } },
    order: ['A']
  },
  gameOver: {   // 파산·목표 미달: 내려가는 단조 4음 + 늘어지는 마지막 음 (약 3.8초)
    key: 'A minor', bpm: 110, stepsPerBeat: 2, beatsPerBar: 7, loop: false, duty: { p1: 0.5, p2: 0.25 }, vibrato: true,
    patterns: { A: {
      p1: ['E5 - C5 - A4 - G#4 - - - - - - .'], p2: ['C5 - A4 - E4 - E4 - - - - - - .'],
      tri: ['A2 - F2 - D2 - E2 - - - - - - .'] } },
    order: ['A']
  },
  victory: {   // 8주 졸업: title 훅(E G A G | E D C)을 느리고 장엄하게 (4초, 스팅어 중 가장 길다)
    key: 'C major', bpm: 120, stepsPerBeat: 4, beatsPerBar: 4, loop: false, duty: { p1: 0.25, p2: 0.25 },
    patterns: { A: {
      p1: ['E5 - - - G5 - - - A5 - - - G5 - - -', 'E5 - D5 - C5 - G5 - C6 - - - - - - .'],
      p2: ['C5 - - - E5 - - - F5 - - - E5 - - -', 'C5 - B4 - G4 - D5 - G5 - - - - - - .'],
      tri: ['C3 - - - C3 - - - F2 - - - C3 - - -', 'A2 - G2 - E2 - G2 - C3 - - - - - - .'],
      noise: ['K . . . S . . . K . . . S . . .', 'K . S . K . S S K . . . . . . .'] } },
    order: ['A']
  }
};

/* ── 믹스 · 스케줄러 상수 ─────────────────────────────── */
const MUSIC_MASTER_GAIN   = 0.5;    // BGM 마스터 = 이 값 × 설정 볼륨 (효과음보다 낮게)
const MUSIC_CH_VOL        = { p1: 0.16, p2: 0.09, tri: 0.3, noise: 0.22, lead2: 0.07, ring: 0.08 };   // 채널 기본 볼륨
const MUSIC_CH_LOWPASS    = { p1: 3200, p2: 2400, tri: 1800, noise: 9000, lead2: 3600, ring: 900 };   // 사각파가 귀를 찌르지 않게
const MUSIC_LOOKAHEAD     = 0.1;    // 초: 앞으로 이만큼 구간의 음을 미리 예약
const MUSIC_LOOKAHEAD_BG  = 1.5;    // 탭이 가려져 타이머가 1초로 느려지면 더 멀리 예약
const MUSIC_WAKE_MS       = 25;     // 스케줄러가 깨어나는 간격
const MUSIC_FADE_S        = 1;      // 기본 크로스페이드
const MUSIC_TEMPO_RAMP    = 0.12;   // market: 장 마감 직전 최대 +12%
const MUSIC_STINGER_DUCK  = 0.3;    // 스팅어가 도는 동안 BGM 볼륨 배율
const MUSIC_VIBRATO       = { rate: 7, depth: 0.012 };   // VOLATILE · gameOver: 주파수의 ±1.2%

const Music = (() => {
  const CHANNELS = ['p1', 'p2', 'tri', 'noise', 'lead2', 'ring'];
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const noteFreq = tok => { const m = /^([A-G]#?)(-?\d)$/.exec(tok); return m ? 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12) : 0; };
  const bars = {};   // 파싱 캐시: 마디 문자열 → 칸 배열
  const parse = str => bars[str] || (bars[str] = str.trim().split(/\s+/));

  let ctx = null, out = null, duckNode = null, stingBus = null, noiseBuf = null, waves = {};
  let enabled = true, volume = 0.4, timer = null;
  let desired = null, current = null, hold = false;   // hold: 스팅어가 끝날 때까지 트랙 전환 보류
  let instances = [];                                  // 도는 곡 (페이드 아웃 중인 것 포함)
  let mood = { state: 'NORMAL', progress: 0, danger: false, fss: false };
  const ducks = {};                                    // 이름 → 볼륨 배율 (찌라시 0.5 · 결산 체인 0.2 …)
  let duckTarget = 1, skippedSteps = 0;   // skippedSteps: 뒤처져서 소리 없이 건너뛴 칸 (검증용)
  const log = [];                                      // 검증용: 마디 시작 기록 { track, t, bar, mood, bpm }

  /* ── 오디오 그래프 (Sound와 같은 AudioContext · 같은 컴프레서) ── */
  function ensure(){
    const c = typeof Sound !== 'undefined' ? Sound.context : null;
    if(!c || !Sound.mixBus) return false;
    if(c === ctx) return true;
    ctx = c; waves = {}; instances = []; current = null; duckTarget = 1;
    out = ctx.createGain(); out.gain.value = MUSIC_MASTER_GAIN * volume; out.connect(Sound.mixBus);
    duckNode = ctx.createGain(); duckNode.connect(out);
    stingBus = ctx.createGain(); stingBus.connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for(let i = 0, v = 0; i < d.length; i++){ if(i % 3 === 0) v = Math.random() * 2 - 1; d[i] = v; }
    return true;
  }
  function pulseWave(duty){   // 듀티비 사각파 (푸리에 32배음)
    if(waves[duty]) return waves[duty];
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for(let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty);
    return (waves[duty] = ctx.createPeriodicWave(re, im));
  }

  /* ── 곡 인스턴스: 채널마다 오실레이터 1개를 계속 켜 두고 게인으로 음을 끊는다 (동시 오실레이터 수 고정) ── */
  function makeInstance(name, loop){
    const song = SONGS[name];
    const fade = ctx.createGain();
    fade.gain.value = 0;
    fade.connect(loop ? duckNode : stingBus);
    const ch = {};
    CHANNELS.forEach(c => {
      if(c === 'lead2' && !(song.layers && song.layers.octave)) return;
      if(c === 'ring' && !(song.layers && song.layers.ring)) return;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = MUSIC_CH_LOWPASS[c];
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(lp); lp.connect(fade);
      const vol = MUSIC_CH_VOL[c] * (song.vol && song.vol[c] !== undefined ? song.vol[c] : 1);
      if(c === 'noise'){ g.gain.value = 1; ch[c] = { gain: g, vol }; return; }
      const osc = ctx.createOscillator();
      if(c === 'tri') osc.type = 'triangle';
      else osc.setPeriodicWave(pulseWave(c === 'ring' ? 0.5 : (song.duty && song.duty[c === 'lead2' ? 'p1' : c]) || 0.5));
      osc.connect(g); osc.start();
      let vib = null;
      if(c === 'p1'){   // 비브라토 (평소 0)
        const lfo = ctx.createOscillator(); vib = ctx.createGain(); vib.gain.value = 0;
        lfo.frequency.value = MUSIC_VIBRATO.rate; lfo.connect(vib); vib.connect(osc.frequency); lfo.start();
        ch.lfo = lfo;
      }
      ch[c] = { osc, gain: g, vol, vib, freq: 0 };
    });
    return { name, song, loop, fade, ch, flat: song.order, patIdx: 0, bar: 0, step: 0, nextTime: ctx.currentTime + 0.06,
             barMood: null, stepDur: 0, done: false, endTime: 0 };
  }
  function stopInstance(inst, seconds){
    const t = ctx.currentTime;
    inst.fade.gain.cancelScheduledValues(t);
    inst.fade.gain.setValueAtTime(inst.fade.gain.value, t);
    inst.fade.gain.linearRampToValueAtTime(0, t + seconds);
    inst.stopping = true;
    setTimeout(() => {
      Object.keys(inst.ch).forEach(k => { const c = inst.ch[k]; try { if(c.osc) c.osc.stop(); if(k === 'lfo') c.stop(); } catch(e) {} });
      try { inst.fade.disconnect(); } catch(e) {}
      instances = instances.filter(x => x !== inst);
    }, seconds * 1000 + 100);
  }

  /* ── 마디 해석: 적응형 규칙은 여기서만 (마디 첫 칸에 고정된 barMood로) ── */
  const patBars = (pat, c) => pat[c] || null;
  function barTokens(inst, c){
    const song = inst.song, pat = song.patterns[inst.flat[inst.patIdx]], m = inst.barMood, L = song.layers || {};
    let list = null;
    if(song.adaptive){
      if(c === 'p2' && m.danger && L.siren) list = L.siren;
      else if(c === 'noise' && m.state === 'VOLATILE' && L.breakbeat) list = L.breakbeat;
      else if(c === 'lead2') list = m.state === 'BULL' ? patBars(pat, 'p1') : null;
      else if(c === 'ring') list = m.fss ? L.ring : null;
      if(!list && m.state === 'BULL' && pat.bull && pat.bull[c]) list = pat.bull[c];
      if(!list && m.state === 'BEAR' && pat.bear && pat.bear[c]) list = pat.bear[c];
    }
    if(!list && c !== 'lead2' && c !== 'ring') list = patBars(pat, c);
    if(!list) return null;
    let toks = parse(list[inst.bar % list.length]);
    if(c === 'noise' && song.adaptive && m.state === 'BEAR') toks = toks.map(x => (x === 'H' || x === 'O' ? '.' : x));   // 약세장: 하이햇 제거
    return toks;
  }
  const patLength = inst => {   // 패턴 마디 수 = 채널 중 가장 긴 것
    const pat = inst.song.patterns[inst.flat[inst.patIdx]];
    return Math.max(...['p1', 'p2', 'tri', 'noise'].map(c => (pat[c] ? pat[c].length : 0)));
  };

  function startBar(inst){
    inst.barMood = inst.song.adaptive ? Object.assign({}, mood) : { state: 'NORMAL', progress: 0, danger: false, fss: false };
    const song = inst.song, m = inst.barMood;
    const bpm = song.bpm * (song.adaptive ? 1 + MUSIC_TEMPO_RAMP * Math.max(0, Math.min(1, m.progress)) : 1);
    inst.stepDur = 60 / bpm / song.stepsPerBeat;
    inst.tokens = {};
    Object.keys(inst.ch).forEach(c => { if(c !== 'lfo') inst.tokens[c] = barTokens(inst, c); });
    const vib = inst.ch.p1 && inst.ch.p1.vib;
    inst.vibOn = (song.adaptive && m.state === 'VOLATILE') || !!song.vibrato;   // 깊이는 음마다 (주파수 비례)
    if(vib && !inst.vibOn) vib.gain.setValueAtTime(0, inst.nextTime);
    log.push({ track: inst.name, t: inst.nextTime, pat: inst.flat[inst.patIdx], bar: inst.bar, mood: Object.assign({}, m), bpm: Math.round(bpm * 10) / 10 });
    if(log.length > 400) log.shift();
  }
  function noteLen(toks, i){ let n = 1; while(i + n < toks.length && toks[i + n] === '-') n++; return n; }
  function stepDurAt(inst, i){   // 스윙: 2칸씩 긴-짧은
    const sw = inst.song.swing || 0;
    return sw ? inst.stepDur * (i % 2 === 0 ? 1 + sw : 1 - sw) : inst.stepDur;
  }
  function playStep(inst, t){
    const i = inst.step;
    Object.keys(inst.tokens).forEach(c => {
      const toks = inst.tokens[c];
      if(!toks) return;
      const tok = toks[i];
      if(!tok || tok === '-' || tok === '.') return;
      const chn = inst.ch[c];
      if(c === 'noise'){ drum(inst, chn, tok, t); return; }
      let f = noteFreq(tok);
      if(!f) return;
      if(c === 'lead2') f *= 2;
      let dur = 0;
      const n = noteLen(toks, i);
      for(let k = 0; k < n; k++) dur += stepDurAt(inst, i + k);
      chn.osc.frequency.setValueAtTime(f, t);
      if(chn.vib) chn.vib.gain.setValueAtTime(inst.vibOn ? f * MUSIC_VIBRATO.depth : 0, t);
      const g = chn.gain.gain, v = chn.vol, rel = Math.min(0.04, dur * 0.3);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(v, t + 0.006);
      g.linearRampToValueAtTime(v * (c === 'tri' ? 0.9 : 0.65), t + Math.max(0.01, dur - rel));   // 칩튠식 감쇠
      g.linearRampToValueAtTime(0, t + dur - 0.002);
    });
  }
  function drum(inst, chn, tok, t){
    const v = chn.vol;
    if(tok === 'K'){   // 킥 = 짧은 삼각파 피치 스윕
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      g.gain.setValueAtTime(v * 2.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(inst.fade); o.start(t); o.stop(t + 0.13);
      return;
    }
    const len = tok === 'S' ? 0.11 : tok === 'O' ? 0.14 : 0.03;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; f.type = tok === 'S' ? 'bandpass' : 'highpass'; f.frequency.value = tok === 'S' ? 1800 : 7000;
    const lv = tok === 'S' ? v * 1.4 : v * 0.6;
    g.gain.setValueAtTime(lv, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f); f.connect(g); g.connect(chn.gain);
    src.start(t, Math.random() * 0.5); src.stop(t + len + 0.01);
  }
  // 한 칸 전진 (play=false면 소리 없이 박자 격자만 따라간다 — 뒤처졌을 때)
  function advance(inst, play){
    if(inst.step === 0) startBar(inst);
    if(play) playStep(inst, inst.nextTime); else skippedSteps++;
    inst.nextTime += stepDurAt(inst, inst.step);
    inst.step++;
    const spb = inst.song.stepsPerBeat * inst.song.beatsPerBar;
    if(inst.step >= spb){
      inst.step = 0; inst.bar++;
      if(inst.bar >= patLength(inst)){
        inst.bar = 0; inst.patIdx++;
        if(inst.patIdx >= inst.flat.length){
          if(inst.loop) inst.patIdx = 0;   // 이음새 없이 처음으로 (다음 칸 시각은 그대로 이어진다)
          else { inst.done = true; inst.endTime = inst.nextTime; }
        }
      }
    }
  }
  const offline = () => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;   // 검증용 렌더링
  const live = () => ctx.state === 'running' || offline();
  function pump(aheadOverride){
    if(!enabled || !ensure()) return;
    if(!live()) return;
    if(!current && desired && !hold) startTrack(desired, MUSIC_FADE_S);
    const now = ctx.currentTime;
    const ahead = aheadOverride || (typeof document !== 'undefined' && document.hidden ? MUSIC_LOOKAHEAD_BG : MUSIC_LOOKAHEAD);
    instances.forEach(inst => {
      if(inst.stopping && !inst.loop) return;
      let guard = 0;
      while(!inst.done && inst.nextTime < now - 0.02 && guard++ < 4096) advance(inst, false);   // 뒤처짐: 격자 유지한 채 건너뛰기
      while(!inst.done && inst.nextTime < now + ahead && guard++ < 8192) advance(inst, true);
      if(inst.done && !inst.stopping && now > inst.endTime + 0.3){ stopInstance(inst, 0.05); if(!inst.loop) stingerEnded(); }
    });
    applyDuck();
  }

  /* ── 트랙 · 페이드 · 스팅어 · 덕킹 ── */
  function startTrack(name, seconds){
    if(!SONGS[name]) return;
    if(current && current.name === name && !current.stopping) return;
    if(current) stopInstance(current, seconds);
    const inst = makeInstance(name, true);
    const t = ctx.currentTime;
    inst.fade.gain.setValueAtTime(0, t);
    inst.fade.gain.linearRampToValueAtTime(1, t + seconds);
    instances.push(inst);
    current = inst;
  }
  function crossfadeTo(name, seconds){
    desired = name;
    if(hold || !enabled || !ensure() || !live()) return;
    startTrack(name, seconds === undefined ? MUSIC_FADE_S : seconds);
  }
  const setTrack = name => { if(name && name !== desired) crossfadeTo(name); };
  function stinger(name, opts){
    opts = opts || {};
    if(!enabled || !ensure() || !live() || !SONGS[name]) return false;
    if(opts.thenTrack){ hold = true; if(current){ stopInstance(current, 0.4); current = null; } }
    const inst = makeInstance(name, false);
    inst.fade.gain.value = 1;
    instances.push(inst);
    pump();
    return true;
  }
  function stingerEnded(){
    if(instances.some(i => !i.loop && !i.done)) return;
    if(hold){ hold = false; if(desired) startTrack(desired, MUSIC_FADE_S); }
  }
  function applyDuck(){
    if(!duckNode) return;
    let v = 1;
    Object.keys(ducks).forEach(k => { v = Math.min(v, ducks[k]); });
    if(instances.some(i => !i.loop && !i.stopping)) v = Math.min(v, MUSIC_STINGER_DUCK);
    if(v !== duckTarget){ duckNode.gain.setTargetAtTime(v, ctx.currentTime, 0.08); duckTarget = v; }
  }
  const duck = (key, level) => { ducks[key] = level; applyDuck(); };
  const unduck = key => { delete ducks[key]; applyDuck(); };
  function setMood(m){ mood = Object.assign({}, mood, m); }

  function setEnabled(on){
    enabled = !!on;
    if(enabled){ if(!timer) timer = setInterval(() => pump(), MUSIC_WAKE_MS); pump(); }
    else {
      clearInterval(timer); timer = null;
      if(ctx) instances.slice().forEach(i => stopInstance(i, 0.3));
      current = null; hold = false;
    }
  }
  function setVolume(v){
    volume = Math.max(0, Math.min(1, v));
    if(out) out.gain.setTargetAtTime(MUSIC_MASTER_GAIN * volume, ctx.currentTime, 0.05);
  }

  /* 곡 데이터 검사: 마디 칸 수, 음 이름 (node로도 돌릴 수 있음) */
  function validate(){
    const errs = [];
    Object.keys(SONGS).forEach(name => {
      const s = SONGS[name], spb = s.stepsPerBeat * s.beatsPerBar;
      const check = (where, list) => (list || []).forEach((b, i) => {
        const t = parse(b);
        if(t.length !== spb) errs.push(`${name}.${where}[${i}] 칸 ${t.length} ≠ ${spb}`);
        t.forEach(x => { if(!/^(-|\.|K|S|H|O|[A-G]#?-?\d)$/.test(x)) errs.push(`${name}.${where}[${i}] 모르는 칸 '${x}'`); });
      });
      Object.keys(s.patterns).forEach(p => {
        const pat = s.patterns[p];
        ['p1', 'p2', 'tri', 'noise'].forEach(c => check(`${p}.${c}`, pat[c]));
        ['bull', 'bear'].forEach(v => pat[v] && Object.keys(pat[v]).forEach(c => check(`${p}.${v}.${c}`, pat[v][c])));
      });
      if(s.layers) ['siren', 'ring', 'breakbeat'].forEach(l => check('layers.' + l, s.layers[l]));
      s.order.forEach(p => { if(!s.patterns[p]) errs.push(`${name}.order '${p}' 없음`); });
    });
    return errs;
  }
  const barsOf = name => { const s = SONGS[name]; return s.order.reduce((n, p) => n + Math.max(...['p1', 'p2', 'tri', 'noise'].map(c => (s.patterns[p][c] ? s.patterns[p][c].length : 0))), 0); };

  return { SONGS, pump, setTrack, crossfadeTo, stinger, duck, unduck, setMood, setEnabled, setVolume, validate, barsOf, noteFreq,
           get track(){ return current ? current.name : null; }, get desired(){ return desired; }, get log(){ return log; },
           get instances(){ return instances.map(i => ({ name: i.name, loop: i.loop, stopping: !!i.stopping, osc: Object.keys(i.ch).filter(k => i.ch[k].osc || k === 'lfo').length })); },
           get skippedSteps(){ return skippedSteps; }, get duckLevel(){ return duckNode ? duckNode.gain.value : 1; }, get enabled(){ return enabled; }, get mood(){ return mood; } };
})();
