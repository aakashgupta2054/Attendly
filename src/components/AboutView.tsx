import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Instagram, ExternalLink, Mail, Globe, Code2, Building2, FileSpreadsheet } from 'lucide-react';
import { motion } from 'motion/react';

export default function AboutView() {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  const toHindiNumerals = (num: number | string) => {
    if (!isHindi) return num.toString();
    const hindiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/[0-9]/g, (w) => hindiDigits[+w]);
  };

  return (
    <div className="space-y-8 sm:space-y-12 pb-16 w-full max-w-4xl mx-auto">
      {/* Brand Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 sm:space-y-5 px-4"
      >
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-primary/10 dark:bg-primary/20 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-primary/10 ring-1 ring-primary/20">
          <Globe className="w-10 h-10 sm:w-12 sm:h-12 text-primary" />
        </div>
        
        <div className="space-y-1.5">
          <h2 className="text-3xl sm:text-5xl font-bold font-heading tracking-tight text-foreground">
            {t('app_name')}
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base font-medium">
            {t('version')} {toHindiNumerals('1.0.0')}
          </p>
        </div>

        {/* Designed & Developed by Aakash Gupta */}
        <div className="pt-1 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 dark:bg-primary/20 border border-primary/25 shadow-xs">
            <Code2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-primary tracking-wide">
              {t('developed_by')} Aakash Gupta
            </span>
          </div>
        </div>
      </motion.div>

      {/* Responsive Grid for all screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-stretch">
        {/* Contact & Support Card */}
        <Card className="bento-card border-primary/15 bg-primary/[0.03] dark:bg-primary/[0.06] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <CardHeader className="p-0 mb-4 font-bold font-heading text-xl sm:text-2xl uppercase tracking-wide">
              {t('contact_us')}
            </CardHeader>
            <CardContent className="p-0 space-y-6">
              <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed font-medium">
                {t('support_message')}
              </p>
              
              <div className="flex flex-col gap-3">
                {/* Instagram Link */}
                <a 
                  href="https://www.instagram.com/aakashgupta2054" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-border/50 hover:border-pink-500/40 hover:bg-pink-500/[0.04] active:scale-[0.98] transition-all group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Instagram className="w-5 h-5 text-pink-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-sm text-foreground block">Instagram</span>
                    <span className="text-xs text-muted-foreground truncate block">@aakashgupta2054</span>
                  </div>
                  <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground opacity-50 group-hover:opacity-100 transition-all ml-1" />
                </a>
                
                {/* Email Support Link */}
                <a 
                  href="mailto:aakashgupta2054@gmail.com"
                  className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-border/50 hover:border-blue-500/40 hover:bg-blue-500/[0.04] active:scale-[0.98] transition-all group shadow-xs"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Mail className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-sm text-foreground block">{t('email_us') || 'Professional Inquiries & Support'}</span>
                    <span className="text-xs text-muted-foreground truncate block">aakashgupta2054@gmail.com</span>
                  </div>
                  <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground opacity-50 group-hover:opacity-100 transition-all ml-1" />
                </a>
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Feature Highlights Cards */}
        <div className="flex flex-col gap-6 justify-between">
          <Card className="bento-card border border-border/40 bg-slate-100/60 dark:bg-slate-800/40 p-6 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                <Building2 className="w-4 h-4" />
              </div>
              <h4 className="text-base sm:text-lg font-bold font-heading">{t('multi_company_support')}</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              {t('multi_company_desc')}
            </p>
          </Card>
          
          <Card className="bento-card border border-border/40 bg-slate-100/60 dark:bg-slate-800/40 p-6 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <h4 className="text-base sm:text-lg font-bold font-heading">{t('payroll_and_reports')}</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
              {t('payroll_reports_desc')}
            </p>
          </Card>
        </div>
      </div>

      {/* Footer copyright */}
      <footer className="text-center opacity-70 pt-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          © {toHindiNumerals('2026')} Aakash Gupta. {t('all_rights_reserved')}.
        </p>
      </footer>
    </div>
  );
}
