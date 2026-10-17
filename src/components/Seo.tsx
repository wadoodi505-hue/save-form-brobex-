import { useEffect } from 'react';
export function Seo({title,description}:{title:string;description:string}){useEffect(()=>{document.title=title;let el=document.querySelector('meta[name="description"]');if(!el){el=document.createElement('meta');el.setAttribute('name','description');document.head.appendChild(el)}el.setAttribute('content',description);},[title,description]);return null}
