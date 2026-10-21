'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

/* =========================================================
   DETECTAR MODO OSCURO
========================================================= */
function useIsDark() {
    const [isDark, setIsDark] = useState(false);
    useEffect(() => {
        const checkDarkMode = () => setIsDark(document.documentElement.classList.contains('dark'));
        checkDarkMode();
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    return isDark;
}

/* =========================================================
   PARTÍCULAS FLOTANTES 
========================================================= */
function FloatingParticles({ count = 140, color }: { count?: number; color: string }) {
    const pointsRef = useRef<THREE.Points>(null);
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 7;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 7;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
        }
        return pos;
    }, [count]);

    useFrame((_, delta) => {
        if (!pointsRef.current) return;
        pointsRef.current.rotation.y += delta * 0.02;
        pointsRef.current.rotation.x += delta * 0.005;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={0.025} color={color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </points>
    );
}

/* =========================================================
   PARTÍCULAS CON TRAYECTORIA CURVA
========================================================= */
function CurvedParticles({ count = 25, color }: { count?: number; color: string }) {
    const particles = useRef<THREE.Mesh[]>([]);

    useEffect(() => {
        particles.current = [];
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.02, 8, 8),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.5,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                })
            );
            mesh.userData = {
                t: Math.random() * Math.PI * 2,
                speed: 0.4 + Math.random() * 0.4,
                radius: 1.2 + Math.random() * 0.8,
            };
            particles.current.push(mesh);
        }
    }, [count, color]);

    useFrame((_, delta) => {
        particles.current.forEach((p) => {
            p.userData.t += delta * p.userData.speed;
            const t = p.userData.t;
            const r = p.userData.radius;

            p.position.set(
                Math.cos(t) * r,
                Math.sin(t * 0.7) * r * 0.5,
                Math.sin(t) * r
            );
        });
    });

    return (
        <group>
            {particles.current.map((p, i) => (
                <primitive key={i} object={p} />
            ))}
        </group>
    );
}

/* =========================================================
   MODELO DEL CEREBRO PRINCIPAL
========================================================= */
function BrainModel({ isDark }: { isDark: boolean }) {
    const { scene } = useGLTF('/models/brain (1).glb');
    const ref = useRef<THREE.Group>(null);
    const brainScale = 0.40;

    const neonColor = isDark ? '#72DF9F' : '#2D8A56';

    useEffect(() => {
        scene.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            const name = mesh.name.toLowerCase();
            
            if (['plane', 'background', 'floor', 'ground', 'stage', 'backdrop'].some(k => name.includes(k))) {
                mesh.visible = false;
                return;
            }

            mesh.visible = true;
            
            mesh.material = new THREE.MeshStandardMaterial({ 
                color: '#F2A7B3',
                emissive: isDark ? '#145336' : '#5fb380',
                emissiveIntensity: isDark ? 0.4 : 0.3,
                roughness: 0.45, 
                metalness: 0.2,
                wireframe: false,
                transparent: true,
                opacity: isDark ? 0.92 : 0.95,
                depthWrite: true,
                depthTest: true,
                side: THREE.DoubleSide,
            });
        });
    }, [scene, isDark]);

    useFrame((_, delta) => {
        if (!ref.current) return;
        ref.current.rotation.y += delta * 0.2;
    });

    return (
        <group ref={ref} scale={brainScale} position={[0, -0.1, 0]}>
            <primitive object={scene} scale={1} position={[0, 0, 0]} />
            <CurvedParticles count={25} color={neonColor} />
        </group>
    );
}

/* =========================================================
   BRAIN 3D CONTAINER
========================================================= */
export function Brain3D() {
    const isDark = useIsDark();
    const neonColor = isDark ? '#72DF9F' : '#2D8A56';

    return (
        <div className="absolute inset-0 pointer-events-none">
            <Canvas
                camera={{ position: [0, 0, 4.5], fov: 45 }}
                gl={{ antialias: true, alpha: true }}
                dpr={[1, 2]}
                style={{ position: 'absolute', inset: 0, background: 'transparent' }}
                onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
            >
                <ambientLight intensity={isDark ? 0.6 : 0.9} />
                <directionalLight position={[4, 6, 4]} intensity={2.2} />
                <directionalLight position={[-4, -2, -4]} intensity={0.8} color={isDark ? '#72DF9F' : '#458a60'} />
                <pointLight position={[0, 3, 3]} intensity={1.5} color={neonColor} />

                <Suspense fallback={null}>
                    <BrainModel isDark={isDark} />
                </Suspense>

                <FloatingParticles count={130} color={neonColor} />
            </Canvas>
        </div>
    );
}

useGLTF.preload('/models/brain (1).glb');