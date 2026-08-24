const signInMenu=document.querySelector('.signin');
if(signInMenu){document.addEventListener('click',event=>{if(!signInMenu.contains(event.target))signInMenu.removeAttribute('open')});document.addEventListener('keydown',event=>{if(event.key==='Escape')signInMenu.removeAttribute('open')})}

document.querySelectorAll('[data-service-video]').forEach(video=>{
  const start=Number(video.dataset.start||0),end=Number(video.dataset.end||0);
  const play=()=>video.play().catch(()=>{});
  video.addEventListener('loadedmetadata',()=>{if(start)video.currentTime=start;play()},{once:true});
  if(end>start)video.addEventListener('timeupdate',()=>{if(video.currentTime>=end||video.currentTime<start-.2){video.currentTime=start;play()}});
});

const stats=document.querySelector('.stats');let counted=false;
function count(){if(counted)return;counted=true;document.querySelectorAll('[data-count]').forEach(element=>{const target=Number(element.dataset.count),suffix=element.dataset.suffix||'',start=performance.now();function tick(now){const progress=Math.min(1,(now-start)/1100),number=Math.floor(target*(1-Math.pow(1-progress,3)));element.textContent=number.toLocaleString()+suffix;if(progress<1)requestAnimationFrame(tick)}requestAnimationFrame(tick)})}
if(stats){if('IntersectionObserver'in window)new IntersectionObserver(entries=>{if(entries[0].isIntersecting)count()},{threshold:.1}).observe(stats);else count()}

function openModal(id){const modal=document.getElementById(id);if(!modal)return;modal.classList.add('open');document.body.style.overflow='hidden'}
function closeModal(id){const modal=document.getElementById(id);if(!modal)return;modal.classList.remove('open');document.body.style.overflow=''}
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeModal(button.dataset.close)));
document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)closeModal(modal.id)}));
document.querySelectorAll('[data-open-career]').forEach(button=>button.addEventListener('click',()=>openModal('careerModal')));
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.modal.open').forEach(modal=>closeModal(modal.id))});

async function submitForm(form,endpoint,extra={}){
  const status=form.querySelector('.form-status'),button=form.querySelector('button[type="submit"],button:not([type])');
  const data=Object.fromEntries(new FormData(form).entries());Object.assign(data,extra);
  if(button)button.disabled=true;if(status)status.textContent='Sending…';
  try{
    const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to send your request.');
    form.reset();if(status){status.textContent=result.message;status.classList.add('success')}
  }catch(error){if(status){status.textContent=error.message;status.classList.add('error')}}finally{if(button)button.disabled=false}
}
const assessmentForm=document.getElementById('assessmentForm');if(assessmentForm)assessmentForm.addEventListener('submit',event=>{event.preventDefault();submitForm(assessmentForm,'/api/public/assessment')});
const contactForm=document.getElementById('contactForm');if(contactForm)contactForm.addEventListener('submit',event=>{event.preventDefault();submitForm(contactForm,'/api/public/contact')});
const careerForm=document.getElementById('careerForm');if(careerForm)careerForm.addEventListener('submit',event=>{event.preventDefault();submitForm(careerForm,'/api/public/career',careerForm.dataset.jobId?{jobId:careerForm.dataset.jobId}:{})});

const chatLauncher=document.getElementById('chatLauncher'),chatPanel=document.getElementById('chatPanel'),chatClose=document.getElementById('chatClose'),chatMessages=document.getElementById('chatMessages');
if(chatLauncher&&chatPanel){
  const toggle=open=>{chatPanel.hidden=!open;chatLauncher.setAttribute('aria-expanded',String(open));if(open)document.getElementById('chatInput')?.focus()};
  const say=(text,kind='bot')=>{const message=document.createElement('p');message.className=kind;message.textContent=text;chatMessages.appendChild(message);chatMessages.scrollTop=chatMessages.scrollHeight};
  const answers={services:'PYX provides guarding, specialist protection, access control, surveillance, electronic detection, training, information security, technology delivery and manpower support.',assessment:'Use the Request an Assessment form so our team can understand your site, scale and preferred timeline.',careers:'Review current vacancies in Careers or share your profile for future opportunities.',location:'Our office address and Google Map are available in the Contact section.'};
  chatLauncher.addEventListener('click',()=>toggle(chatPanel.hidden));chatClose?.addEventListener('click',()=>toggle(false));
  document.querySelectorAll('[data-chat]').forEach(button=>button.addEventListener('click',()=>say(answers[button.dataset.chat])));
  document.getElementById('chatForm')?.addEventListener('submit',event=>{event.preventDefault();const input=document.getElementById('chatInput'),text=input.value.trim();if(!text)return;say(text,'user');input.value='';const lower=text.toLowerCase();const answer=lower.includes('career')?answers.careers:lower.includes('address')||lower.includes('location')?answers.location:lower.includes('assessment')||lower.includes('quote')?answers.assessment:answers.services;setTimeout(()=>say(answer),250)});
}
