import {StyleSheet,Text,View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {alpha,Fonts,Spacing} from '@/constants/theme';
import {useAppColors} from '@/hooks/use-app-colors';
import {useI18n} from '@/hooks/use-i18n';
import {useTheme} from '@/hooks/use-theme';
import {transitTime} from '@/transit/model';
import {routeColor} from '@/transit/ui';
import {etaMinutes,type EtaPreviewPrediction} from '@/transit/eta-preview';
export function EtaPreviewCard({enabled,predictions,now,loading}:{enabled:boolean;predictions:EtaPreviewPrediction[];now:number;loading:boolean}){
 const colors=useAppColors(),theme=useTheme(),{t}=useI18n();
 if(!enabled)return null;
 return <View testID="eta-preview-card" style={[styles.card,{backgroundColor:colors.surfaceHigh,borderColor:colors.border}]}>
  <View style={styles.heading}><MaterialCommunityIcons name="bus-clock" size={Spacing.four} color={colors.primary}/><Text accessibilityRole="header" style={[styles.title,{color:theme.text}]}>{t('etaPreviewTitle')}</Text></View>
  {predictions.length?predictions.map(p=>{
   const {from,to,ageSeconds}=etaMinutes(p,now),color=routeColor(p.boarding.route.id,colors);
   const range=from===to?t('etaPreviewSingle',{minutes:from}):t('etaPreviewRange',{from,to});
   return <View key={p.id} style={[styles.prediction,{borderColor:colors.border}]}>
    <View style={styles.heading}><View style={[styles.badge,{backgroundColor:alpha(color,'20')}]}><Text style={[styles.route,{color}]}>{p.boarding.route.shortName}</Text></View>
     <Text style={[styles.range,{color:theme.text}]}>{range}</Text><Text style={[styles.clock,{color:theme.textSecondary}]}>{transitTime(p.arrivalFrom)}–{transitTime(p.arrivalTo)}</Text></View>
    <Text style={[styles.hint,{color:theme.textSecondary}]}>{t('etaPreviewFreshness',{seconds:ageSeconds})}</Text>
   </View>;
  }):<Text style={[styles.body,{color:theme.textSecondary}]}>{t(loading?'etaPreviewLoading':'etaPreviewFallback')}</Text>}
  {predictions.length?<Text style={[styles.hint,{color:theme.textSecondary}]}>{t('etaPreviewNote')}</Text>:null}
 </View>;
}
const styles=StyleSheet.create({
 card:{padding:Spacing.three,gap:Spacing.two,borderRadius:Spacing.three,borderWidth:1,marginBottom:Spacing.three},
 heading:{flexDirection:'row',alignItems:'center',gap:Spacing.two,flexWrap:'wrap'},
 title:{fontFamily:Fonts?.sans,fontSize:Spacing.three,fontWeight:'700',lineHeight:Spacing.four},
 prediction:{gap:Spacing.one,paddingVertical:Spacing.two,borderTopWidth:1},
 badge:{paddingHorizontal:Spacing.two,paddingVertical:Spacing.one,borderRadius:Spacing.two},
 route:{fontFamily:Fonts?.mono,fontSize:Spacing.three,fontWeight:'700'},
 range:{fontFamily:Fonts?.sans,fontSize:Spacing.four,fontWeight:'700'},
 clock:{fontFamily:Fonts?.mono,fontSize:Spacing.three-Spacing.half},
 hint:{fontFamily:Fonts?.sans,fontSize:Spacing.three-Spacing.half,lineHeight:Spacing.four},
 body:{fontFamily:Fonts?.sans,fontSize:Spacing.three,lineHeight:Spacing.four},
});
