import Image from 'next/image';
import Link from 'next/link';

import { commonsSearchUrl } from '@/lib/urls';

/**
 * Marketing footer — pure Server Component, no hooks. Renders identically
 * for every viewer; no per-user content.
 *
 * Layout uses a 4-column grid at desktop, 2-column at <900px, 1-column
 * at <480px (matches the source SCSS responsive cutoffs verbatim).
 */
export function Footer() {
  return (
    <footer className="bg-black text-white/70 px-7 pt-16 pb-7 w-full font-sans">
      <div className="max-w-[1200px] mx-auto grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-12 max-nav:grid-cols-2 max-nav:gap-8 max-[480px]:grid-cols-1 max-[480px]:gap-6">
        {/* Brand column */}
        <div>
          <Image
            src="/logos/ndicloud-wordmark-horizontal.svg"
            alt="NDI Cloud"
            width={121}
            height={22}
            className="block h-[22px] w-auto mb-3.5 brightness-0 invert"
          />
          <p className="text-[13px] max-w-[300px] leading-[1.5] text-white/50 m-0">
            Data infrastructure, DOI publishing, and AI tools for neuroscience labs.
          </p>
        </div>

        {/* Products */}
        <FooterColumn title="Products">
          <FooterLink href="/">NDI Cloud overview</FooterLink>
          <FooterLink href="/products/private-cloud">For Labs</FooterLink>
          <FooterLink href={commonsSearchUrl()}>Data Commons</FooterLink>
          <FooterLink href="/products/labchat">LabChat</FooterLink>
          <FooterLink href="/platform">How NDI works</FooterLink>
        </FooterColumn>

        {/* Company */}
        <FooterColumn title="Company">
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/about#partnerships">Partners</FooterLink>
          <FooterLink href="/security">Security &amp; Compliance</FooterLink>
          <FooterLink
            href="https://github.com/VH-Lab/NDI-matlab"
            target="_blank"
            rel="noopener noreferrer"
          >
            Research on GitHub
          </FooterLink>
        </FooterColumn>

        {/* Get in touch */}
        <FooterColumn title="Get in touch">
          <FooterLink href="mailto:info@walthamdatascience.com?subject=NDI Cloud Inquiry">
            info@walthamdatascience.com
          </FooterLink>
          <FooterLink
            href="https://vh-lab.github.io/NDI-matlab/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </FooterLink>
          <FooterLink href="/about#sfn">SfN 2025 · San Diego</FooterLink>
        </FooterColumn>
      </div>

      <div className="max-w-[1200px] mx-auto mt-14 pt-5 border-t border-white/10 flex justify-between text-xs text-white/40 max-[640px]:flex-col max-[640px]:gap-2 max-[640px]:text-center">
        <div>© 2026 Waltham Data Science · NDI Cloud</div>
        <div>Privacy · Terms · Security</div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-[11px] font-bold tracking-[0.12em] uppercase text-white mt-0 mb-4">
        {title}
      </h5>
      {children}
    </div>
  );
}

type FooterLinkProps = {
  href: string;
  children: React.ReactNode;
  target?: string;
  rel?: string;
};

function FooterLink({ href, children, target, rel }: FooterLinkProps) {
  // Internal hash + slash links use Next's <Link> for client-side
  // navigation. External / mailto / target="_blank" links use a raw <a>
  // since <Link> doesn't add value for those.
  const isInternal = href.startsWith('/') && !target;
  const className =
    'block py-1 text-[13.5px] text-white/65 no-underline hover:text-white transition-colors duration-(--duration-base) ease-(--ease-out)';

  if (isInternal) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target={target} rel={rel} className={className}>
      {children}
    </a>
  );
}
