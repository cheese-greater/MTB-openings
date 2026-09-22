import { useEffect, useRef } from 'react';

import './TrailDog.css';

// How far short of the cursor the dog pulls up, measured from its center, so it
// never sits on top of whatever the reader is about to click.
const HEEL_DISTANCE = 44;
// Top speed in px per ms (about 600 px a second): quick enough to keep up with a
// flick across the page without looking like it teleported.
const TOP_SPEED = 0.6;
// Time constant of the ease-out as the dog closes in, in ms.
const EASE_TIME = 110;
// A frame gap longer than this (a background tab coming back) is treated as one
// short frame so the dog does not jump across the screen.
const MAX_FRAME_MS = 50;
// Movement slower than this reads as standing, so the legs stop cycling.
const RUN_THRESHOLD = 0.02; // px per ms

// Rendered size of the sprite, matched by .trail-dog in TrailDog.css.
const SPRITE_WIDTH = 56;
const SPRITE_HEIGHT = 35;

type Pose = 'idle' | 'run';

interface Point {
	x: number;
	y: number;
}

// A dog that runs after the mouse and waits at heel when it stops. Everything
// per frame is written straight to the element (transform and a data-pose
// attribute the CSS animates on) rather than through React state, so following
// the cursor costs no re-renders. The caller decides when to mount it: App.tsx
// leaves it out on touch devices, under prefers-reduced-motion, and when the
// reader has switched it off.
function TrailDog() {
	const spriteRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sprite = spriteRef.current;
		if (!sprite) return;

		// Parked just off the left edge (where the stylesheet also puts it before
		// this runs), so the first cursor movement brings the dog running in
		// rather than popping it into existence.
		const dog: Point = { x: -SPRITE_WIDTH, y: window.innerHeight * 0.8 };
		let cursor: Point | null = null;
		let facing = 1;
		let lastFrameAt = 0;
		let frame: number | null = null;

		const draw = (pose: Pose) => {
			const left = dog.x - SPRITE_WIDTH / 2;
			const top = dog.y - SPRITE_HEIGHT / 2;
			sprite.style.transform = `translate3d(${left}px, ${top}px, 0) scaleX(${facing})`;
			if (sprite.dataset.pose !== pose) sprite.dataset.pose = pose;
		};

		// Runs only while there is ground to cover: once the dog is at heel it
		// stops asking for frames, and the next pointer movement starts it again.
		const tick = (now: number) => {
			frame = null;
			const elapsed = Math.min(now - lastFrameAt, MAX_FRAME_MS);
			lastFrameAt = now;
			if (!cursor) {
				draw('idle');
				return;
			}

			const toCursorX = cursor.x - dog.x;
			const toCursorY = cursor.y - dog.y;
			const distance = Math.hypot(toCursorX, toCursorY);
			const remaining = distance - HEEL_DISTANCE;
			if (remaining <= 0.5) {
				draw('idle');
				return;
			}

			// Flat out when far away, easing off as it arrives.
			const step = Math.min(remaining, TOP_SPEED * elapsed, remaining * (1 - Math.exp(-elapsed / EASE_TIME)));
			dog.x += (toCursorX / distance) * step;
			dog.y += (toCursorY / distance) * step;
			if (Math.abs(toCursorX) > 2) facing = toCursorX < 0 ? -1 : 1;
			draw(step / elapsed > RUN_THRESHOLD ? 'run' : 'idle');
			frame = requestAnimationFrame(tick);
		};

		const follow = (event: PointerEvent) => {
			if (event.pointerType === 'touch') return;
			cursor = { x: event.clientX, y: event.clientY };
			if (frame === null) {
				lastFrameAt = performance.now();
				frame = requestAnimationFrame(tick);
			}
		};

		// The cursor has left the window: stop where we are rather than chasing
		// the last point it was seen.
		const loseCursor = () => {
			cursor = null;
		};

		draw('idle');
		window.addEventListener('pointermove', follow);
		document.documentElement.addEventListener('pointerleave', loseCursor);
		return () => {
			window.removeEventListener('pointermove', follow);
			document.documentElement.removeEventListener('pointerleave', loseCursor);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, []);

	// The sprite faces right; the container is flipped with scaleX to face left.
	// Legs are drawn as two pairs (near side and far side) on opposite phases of
	// the running cycle, with the body between them for depth.
	return (
		<div aria-hidden='true' className='trail-dog' data-pose='idle' ref={spriteRef}>
			<svg className='trail-dog__sprite' viewBox='0 0 64 40'>
				<g className='trail-dog__tail'>
					<path
						d='M14 20 C 6 18, 4 10, 9 5'
						fill='none'
						stroke='var(--dog-fur)'
						strokeLinecap='round'
						strokeWidth='4.5'
					/>
				</g>
				<g transform='translate(19 26)'>
					<g className='trail-dog__leg trail-dog__leg--far trail-dog__leg--phase-a'>
						<rect fill='var(--dog-fur-dark)' height='13' rx='2.5' width='5' x='-2.5' y='-2' />
					</g>
				</g>
				<g transform='translate(41 26)'>
					<g className='trail-dog__leg trail-dog__leg--far trail-dog__leg--phase-b'>
						<rect fill='var(--dog-fur-dark)' height='13' rx='2.5' width='5' x='-2.5' y='-2' />
					</g>
				</g>
				<g className='trail-dog__body'>
					<ellipse cx='30' cy='22' fill='var(--dog-fur)' rx='17' ry='9' />
				</g>
				<g transform='translate(23 27)'>
					<g className='trail-dog__leg trail-dog__leg--near trail-dog__leg--phase-b'>
						<rect fill='var(--dog-fur)' height='13' rx='2.5' width='5' x='-2.5' y='-2' />
					</g>
				</g>
				<g transform='translate(37 27)'>
					<g className='trail-dog__leg trail-dog__leg--near trail-dog__leg--phase-a'>
						<rect fill='var(--dog-fur)' height='13' rx='2.5' width='5' x='-2.5' y='-2' />
					</g>
				</g>
				<g className='trail-dog__head'>
					<circle cx='47' cy='15' fill='var(--dog-fur)' r='8.5' />
					<ellipse cx='54.5' cy='18' fill='var(--dog-fur-light)' rx='5.5' ry='3.8' />
					<path
						className='trail-dog__tongue'
						d='M53 21.5 q0.5 4 3 2'
						fill='none'
						stroke='var(--dog-tongue)'
						strokeLinecap='round'
						strokeWidth='2.2'
					/>
					<circle cx='58.5' cy='17' fill='var(--dog-nose)' r='1.6' />
					<circle cx='48.5' cy='13' fill='var(--dog-nose)' r='1.4' />
					<path
						d='M39.5 19.5 q4 3.5 8.5 1.5'
						fill='none'
						stroke='var(--accent)'
						strokeLinecap='round'
						strokeWidth='2.4'
					/>
					<g className='trail-dog__ear'>
						<path
							d='M43 7.5 C 36.5 9, 35.5 18, 40 19.5 C 43.5 18.5, 45 12, 43 7.5 Z'
							fill='var(--dog-fur-dark)'
						/>
					</g>
				</g>
			</svg>
		</div>
	);
}

export default TrailDog;
