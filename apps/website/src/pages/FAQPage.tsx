import { Fragment, useState } from 'react';
import { PageHero } from '@/components/layout/PageHero';
import { Button } from '@/components/ui/Button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Icon } from '@/components/ui/Icon';
import { faqSections } from '@/data/faqs';
import type { Navigate } from '@/types/site';

function FaqInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function FAQPage({ go }: { go: Navigate }) {
  const [open, setOpen] = useState(0);
  let itemIndex = 0;

  return (
    <>
      <PageHero
        eyebrow="Frequently asked questions"
        title={
          <>
            Got <em>questions?</em>
          </>
        }
        text="Straightforward answers to some questions you might have."
      />
      <section className="section faq-list">
        {faqSections.map((section) => (
          <div key={section.title} className="faq-section">
            <h2 className="faq-section-title">{section.title}</h2>
            {section.items.map((item) => {
              const i = itemIndex++;
              return (
                <article key={item.question} className={open === i ? 'faq-open' : ''}>
                  <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                    <strong>{item.question}</strong>
                    <i>
                      <Icon name={open === i ? 'close' : 'plus'} />
                    </i>
                  </button>
                  <div className="faq-answer">
                    <div className="faq-answer-inner">
                      {item.blocks.map((block, bi) => {
                        if (block.type === 'p') {
                          return (
                            <p key={bi}>
                              <FaqInline text={block.text} />
                            </p>
                          );
                        }
                        if (block.type === 'ul') {
                          return (
                            <ul key={bi}>
                              {block.items.map((line, li) => (
                                <li key={li}>
                                  <FaqInline text={line} />
                                </li>
                              ))}
                            </ul>
                          );
                        }
                        return (
                          <ol key={bi}>
                            {block.items.map((line, li) => (
                              <li key={li}>
                                <FaqInline text={line} />
                              </li>
                            ))}
                          </ol>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </section>
      <section className="question-card section">
        <div>
          <Eyebrow>Still curious?</Eyebrow>
          <h2>Let’s talk</h2>
          <p>We'll be happy to clarify any questions you have.</p>
        </div>
        <Button onClick={() => go('contact')}>
          Book a demo <Icon name="arrow" size={17} />
        </Button>
      </section>
    </>
  );
}
